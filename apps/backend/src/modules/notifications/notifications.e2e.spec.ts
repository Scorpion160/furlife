import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OutboxStatus, type Prisma } from '@prisma/client';
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

describe('Notifications and outbox vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: OutboxProcessorService;

  const otpSender = new CapturingOtpSender();
  const phones: string[] = [];
  const challengeIds: string[] = [];
  const shipmentIds: string[] = [];
  const categoryIds: string[] = [];
  const corridorIds: string[] = [];
  const eventIds: string[] = [];

  let corridorId: string;
  let categoryId: string;

  const deviceId = 'furlife-notifications-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22170${suffix}`;
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
        originCity: `Dakar-notif-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-notif-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });
    corridorId = corridor.id;
    corridorIds.push(corridor.id);

    const category = await prisma.parcelCategory.create({
      data: {
        code: `NOTIF_ALLOWED_${suffix}`,
        label: `Notification autorisée ${suffix}`,
        isAllowed: true,
      },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
  });

  afterAll(async () => {
    if (shipmentIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { relatedId: { in: shipmentIds } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: shipmentIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entity: 'shipment', entityId: { in: shipmentIds } },
            { entity: 'outbox_event' },
          ],
        },
      });
      await prisma.shipment.deleteMany({
        where: { id: { in: shipmentIds } },
      });
    }

    if (eventIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { id: { in: eventIds } },
      });
    }

    if (categoryIds.length > 0) {
      await prisma.parcelCategory.deleteMany({
        where: { id: { in: categoryIds } },
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

  async function createAndSubmit(accessToken: string) {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/shipments/drafts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        corridorId,
        parcels: [
          {
            categoryId,
            description: 'Colis pour notification',
            declaredWeight: 0.8,
          },
        ],
      })
      .expect(201);

    shipmentIds.push(draft.body.id);

    await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(201);

    return draft.body;
  }

  it('creates one deduplicated notification and exposes unread/read state', async () => {
    const owner = await login(createTestPhone());
    const shipment = await createAndSubmit(owner.accessToken);

    const firstBatch = await processor.processBatch(20);
    expect(firstBatch).toBeGreaterThanOrEqual(1);

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        aggregateId: shipment.id,
        eventType: 'shipment.submitted',
      },
    });
    eventIds.push(event.id);
    expect(event.status).toBe(OutboxStatus.PUBLISHED);

    const listed = await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toEqual(
      expect.objectContaining({
        type: 'shipment_submitted',
        relatedType: 'shipment',
        relatedId: shipment.id,
        readAt: null,
      }),
    );

    const duplicate = await prisma.outboxEvent.create({
      data: {
        aggregate: 'shipment',
        aggregateId: shipment.id,
        eventType: 'shipment.submitted',
        payload: JSON.parse(JSON.stringify(event.payload)) as Prisma.InputJsonValue,
      },
    });
    eventIds.push(duplicate.id);

    await processor.processBatch(20);

    const notificationCount = await prisma.notification.count({
      where: {
        userId: owner.user.id,
        type: 'shipment_submitted',
        relatedId: shipment.id,
      },
    });
    expect(notificationCount).toBe(1);

    const unread = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(unread.body).toEqual({ count: 1 });

    const outsider = await login(createTestPhone());
    const hidden = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${listed.body[0].id}/read`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);
    expect(hidden.body.error.code).toBe('NOTIFICATION_NOT_FOUND');

    const read = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${listed.body[0].id}/read`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(201);
    expect(read.body.readAt).toEqual(expect.any(String));

    const afterRead = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(afterRead.body).toEqual({ count: 0 });
  });

  it('moves malformed events to FAILED with a retry backoff and audit trace', async () => {
    const malformed = await prisma.outboxEvent.create({
      data: {
        aggregate: 'shipment',
        aggregateId: 'missing-shipment',
        eventType: 'shipment.submitted',
        payload: {
          publicRef: 'FL-MALFORMED',
        },
      },
    });
    eventIds.push(malformed.id);

    await processor.processBatch(20);

    const failed = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: malformed.id },
    });

    expect(failed.status).toBe(OutboxStatus.FAILED);
    expect(failed.attempts).toBe(1);
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());

    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'outbox_event',
        entityId: malformed.id,
        action: 'outbox.process.failed',
      },
    });
    expect(audit).not.toBeNull();
  });
});
