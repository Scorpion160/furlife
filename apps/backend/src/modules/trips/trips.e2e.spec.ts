import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { configureApiTestApp } from '../../testing/configure-api-test-app';
import { OtpSenderService } from '../identity/services/otp-sender.service';

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

describe('Carrier trip draft vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const otpSender = new CapturingOtpSender();
  const phones: string[] = [];
  const challengeIds: string[] = [];
  const tripIds: string[] = [];
  const corridorIds: string[] = [];

  let corridorId: string;
  const deviceId = 'furlife-trip-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22178${suffix}`;
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
    await app.init();

    const suffix = randomInt(100_000, 1_000_000).toString();
    const corridor = await prisma.corridor.create({
      data: {
        originCountry: 'SN',
        originCity: `Dakar-trip-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-trip-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });

    corridorId = corridor.id;
    corridorIds.push(corridor.id);
  });

  afterAll(async () => {
    if (tripIds.length > 0) {
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

  async function grantCarrier(userId: string) {
    await prisma.userRoleAssignment.create({
      data: {
        userId,
        role: UserRole.CARRIER,
      },
    });
  }

  it('refuses trip management for a regular Client', async () => {
    const client = await login(createTestPhone());

    const response = await request(app.getHttpServer())
      .get('/api/v1/trips/options')
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(403);

    expect(response.body.error.code).toBe('TRIP_CARRIER_ROLE_REQUIRED');
  });

  it('creates, protects and submits a Carrier trip draft', async () => {
    const owner = await login(createTestPhone());
    await grantCarrier(owner.user.id);

    const options = await request(app.getHttpServer())
      .get('/api/v1/trips/options')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(options.body.corridors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: corridorId }),
      ]),
    );

    const departureAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const created = await request(app.getHttpServer())
      .post('/api/v1/trips/drafts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Request-Id', 'trip-e2e-create')
      .send({
        corridorId,
        flightNo: ' af 718 ',
        departureAt: departureAt.toISOString(),
        capacityKg: 12.5,
      })
      .expect(201);

    tripIds.push(created.body.id);

    expect(created.body.status).toBe('DRAFT');
    expect(created.body.version).toBe(1);
    expect(created.body.flightNo).toBe('AF718');
    expect(created.body.capacityKg).toBe('12.5');
    expect(created.body.reservedKg).toBe('0');
    expect(created.body.availableKg).toBe('12.5');

    const mine = await request(app.getHttpServer())
      .get('/api/v1/trips/mine')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(mine.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          flightNo: 'AF718',
          status: 'DRAFT',
        }),
      ]),
    );

    const outsider = await login(createTestPhone());
    await grantCarrier(outsider.user.id);

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/trips/${created.body.id}`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    expect(hidden.body.error.code).toBe('TRIP_NOT_FOUND');

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/trips/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Request-Id', 'trip-e2e-submit')
      .send({ version: 1 })
      .expect(201);

    expect(submitted.body.status).toBe('PENDING_REVIEW');
    expect(submitted.body.version).toBe(2);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        aggregate: 'trip',
        aggregateId: created.body.id,
        eventType: 'trip.submitted',
      },
    });
    expect(outbox).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'trip',
        entityId: created.body.id,
        action: 'trip.submit',
      },
    });
    expect(audit?.requestId).toBe('trip-e2e-submit');

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/trips/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ version: 1 })
      .expect(409);

    expect(replay.body.error.code).toBe('TRIP_NOT_DRAFT');
  });

  it('rejects a departure date in the past', async () => {
    const owner = await login(createTestPhone());
    await grantCarrier(owner.user.id);

    const response = await request(app.getHttpServer())
      .post('/api/v1/trips/drafts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        corridorId,
        flightNo: 'HC403',
        departureAt: new Date(Date.now() - 60_000).toISOString(),
        capacityKg: 8,
      })
      .expect(400);

    expect(response.body.error.code).toBe('TRIP_DEPARTURE_NOT_FUTURE');
  });
});
