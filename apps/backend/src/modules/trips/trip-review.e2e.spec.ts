import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxStatus, UserRole } from '@prisma/client';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { configureApiTestApp } from '../../testing/configure-api-test-app';
import { OtpSenderService } from '../identity/services/otp-sender.service';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';

class CapturingOtpSender {
  private readonly codes = new Map<string, string>();

  async send(phoneE164: string, code: string): Promise<void> {
    this.codes.set(phoneE164, code);
  }

  codeFor(phoneE164: string): string {
    const code = this.codes.get(phoneE164);
    if (!code) throw new Error(`OTP not captured for ${phoneE164}`);
    return code;
  }
}

describe('Trip review and open vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: OutboxProcessorService;

  const otpSender = new CapturingOtpSender();
  const phones: string[] = [];
  const challengeIds: string[] = [];
  const tripIds: string[] = [];
  const corridorIds: string[] = [];

  let corridorId: string;
  const deviceId = 'furlife-trip-review-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22179${suffix}`;
    phones.push(phone);
    return phone;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpSenderService)
      .useValue(otpSender)
      .compile();

    app = configureApiTestApp(moduleRef.createNestApplication());
    prisma = moduleRef.get(PrismaService);
    processor = moduleRef.get(OutboxProcessorService);
    await app.init();

    const suffix = randomInt(100_000, 1_000_000).toString();
    const corridor = await prisma.corridor.create({
      data: {
        originCountry: 'SN',
        originCity: `Dakar-review-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-review-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });

    corridorId = corridor.id;
    corridorIds.push(corridor.id);
  });

  afterAll(async () => {
    if (tripIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          relatedType: 'trip',
          relatedId: { in: tripIds },
        },
      });
      await prisma.outboxEvent.deleteMany({
        where: {
          aggregate: 'trip',
          aggregateId: { in: tripIds },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entity: 'trip',
          entityId: { in: tripIds },
        },
      });
      await prisma.trip.deleteMany({
        where: { id: { in: tripIds } },
      });
    }

    if (corridorIds.length > 0) {
      await prisma.corridor.deleteMany({
        where: { id: { in: corridorIds } },
      });
    }

    if (challengeIds.length > 0) {
      await prisma.verificationChallenge.deleteMany({
        where: { id: { in: challengeIds } },
      });
    }

    if (phones.length > 0) {
      await prisma.user.deleteMany({
        where: { phoneE164: { in: phones } },
      });
    }

    await app.close();
  });

  async function login(phoneE164: string) {
    const started = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/start')
      .set('X-Device-Id', deviceId)
      .send({ phoneE164 })
      .expect(201);

    challengeIds.push(started.body.challengeId);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .set('X-Device-Id', deviceId)
      .send({
        challengeId: started.body.challengeId,
        phoneE164,
        code: otpSender.codeFor(phoneE164),
      })
      .expect(201);

    return verified.body;
  }

  async function grantRole(userId: string, role: UserRole) {
    await prisma.userRoleAssignment.create({
      data: { userId, role },
    });
  }

  async function createPendingTrip(accessToken: string) {
    const departureAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    const draft = await request(app.getHttpServer())
      .post('/api/v1/trips/drafts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        corridorId,
        flightNo: 'HC 403',
        departureAt: departureAt.toISOString(),
        capacityKg: 15,
      })
      .expect(201);

    tripIds.push(draft.body.id);

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/trips/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(201);

    expect(submitted.body.status).toBe('PENDING_REVIEW');
    expect(submitted.body.version).toBe(2);

    return submitted.body;
  }

  it('allows only an operator to approve and only the owner Carrier to open', async () => {
    const carrier = await login(createTestPhone());
    await grantRole(carrier.user.id, UserRole.CARRIER);
    const pending = await createPendingTrip(carrier.accessToken);

    const regularClient = await login(createTestPhone());

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/admin/trips/pending')
      .set('Authorization', `Bearer ${regularClient.accessToken}`)
      .expect(403);

    expect(forbidden.body.error.code).toBe('TRIP_OPERATOR_ROLE_REQUIRED');

    const operator = await login(createTestPhone());
    await grantRole(operator.user.id, UserRole.OPERATOR);

    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/trips/pending')
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .expect(200);

    expect(queue.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pending.id,
          carrierId: carrier.user.id,
          status: 'PENDING_REVIEW',
        }),
      ]),
    );

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/admin/trips/${pending.id}/approve`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .set('X-Request-Id', 'trip-review-e2e-approve')
      .send({ version: 2 })
      .expect(201);

    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.version).toBe(3);

    const approvalEvent = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        aggregate: 'trip',
        aggregateId: pending.id,
        eventType: 'trip.approved',
      },
    });
    expect(approvalEvent.status).toBe(OutboxStatus.PENDING);

    const approvalAudit = await prisma.auditLog.findFirst({
      where: {
        entity: 'trip',
        entityId: pending.id,
        action: 'trip.approve',
      },
    });
    expect(approvalAudit?.requestId).toBe('trip-review-e2e-approve');

    await processor.processBatch(50);

    const notification = await prisma.notification.findFirst({
      where: {
        userId: carrier.user.id,
        type: 'trip_approved',
        relatedId: pending.id,
      },
    });
    expect(notification).not.toBeNull();

    const carrierNotifications = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .expect(200);

    expect(carrierNotifications.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'trip_approved',
          relatedType: 'trip',
          relatedId: pending.id,
        }),
      ]),
    );

    const outsider = await login(createTestPhone());
    await grantRole(outsider.user.id, UserRole.CARRIER);

    const hidden = await request(app.getHttpServer())
      .post(`/api/v1/trips/${pending.id}/open`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ version: 3 })
      .expect(404);

    expect(hidden.body.error.code).toBe('TRIP_NOT_FOUND');

    const opened = await request(app.getHttpServer())
      .post(`/api/v1/trips/${pending.id}/open`)
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .set('X-Request-Id', 'trip-review-e2e-open')
      .send({ version: 3 })
      .expect(201);

    expect(opened.body.status).toBe('OPEN');
    expect(opened.body.version).toBe(4);

    const openedEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregate: 'trip',
        aggregateId: pending.id,
        eventType: 'trip.opened',
      },
    });
    expect(openedEvent).not.toBeNull();

    const openAudit = await prisma.auditLog.findFirst({
      where: {
        entity: 'trip',
        entityId: pending.id,
        action: 'trip.open',
      },
    });
    expect(openAudit?.requestId).toBe('trip-review-e2e-open');

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/trips/${pending.id}/open`)
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .send({ version: 3 })
      .expect(409);

    expect(replay.body.error.code).toBe('TRIP_NOT_APPROVED');
  });
});
