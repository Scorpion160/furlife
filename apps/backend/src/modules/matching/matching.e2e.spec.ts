import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Prisma, UserRole } from '@prisma/client';
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

describe('Matching proposals vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: OutboxProcessorService;

  const otpSender = new CapturingOtpSender();
  const phones: string[] = [];
  const challengeIds: string[] = [];
  const shipmentIds: string[] = [];
  const tripIds: string[] = [];
  const corridorIds: string[] = [];
  const categoryIds: string[] = [];
  const extraEventIds: string[] = [];

  let corridorId: string;
  let categoryId: string;
  const deviceId = 'furlife-matching-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22171${suffix}`;
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
        originCity: `Dakar-match-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-match-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });
    corridorId = corridor.id;
    corridorIds.push(corridor.id);

    const category = await prisma.parcelCategory.create({
      data: {
        code: `MATCH_ALLOWED_${suffix}`,
        label: `Matching autorisé ${suffix}`,
        isAllowed: true,
      },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
  });

  afterAll(async () => {
    if (shipmentIds.length > 0) {
      await prisma.match.deleteMany({
        where: { shipmentId: { in: shipmentIds } },
      });
      await prisma.notification.deleteMany({
        where: {
          relatedId: { in: shipmentIds },
        },
      });
      await prisma.outboxEvent.deleteMany({
        where: {
          aggregateId: { in: shipmentIds },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entity: 'shipment',
          entityId: { in: shipmentIds },
        },
      });
      await prisma.shipment.deleteMany({
        where: { id: { in: shipmentIds } },
      });
    }

    if (tripIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          relatedType: 'trip',
          relatedId: { in: tripIds },
        },
      });
      await prisma.outboxEvent.deleteMany({
        where: {
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

    if (extraEventIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { id: { in: extraEventIds } },
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

  async function grantRole(userId: string, role: UserRole) {
    await prisma.userRoleAssignment.create({
      data: { userId, role },
    });
  }

  async function createSubmittedShipment(
    accessToken: string,
    declaredWeight: number,
  ) {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/shipments/drafts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        corridorId,
        parcels: [
          {
            categoryId,
            description: 'Colis pour matching',
            declaredWeight,
          },
        ],
      })
      .expect(201);

    shipmentIds.push(draft.body.id);

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ version: 1 })
      .expect(201);

    expect(submitted.body.status).toBe('SUBMITTED');
    return submitted.body;
  }

  async function createOpenTrip(capacityKg: number) {
    const carrier = await login(createTestPhone());
    await grantRole(carrier.user.id, UserRole.CARRIER);

    const departureAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

    const draft = await request(app.getHttpServer())
      .post('/api/v1/trips/drafts')
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .send({
        corridorId,
        flightNo: 'AF 718',
        departureAt: departureAt.toISOString(),
        capacityKg,
      })
      .expect(201);

    tripIds.push(draft.body.id);

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${draft.body.id}/submit`)
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .send({ version: 1 })
      .expect(201);

    const operator = await login(createTestPhone());
    await grantRole(operator.user.id, UserRole.OPERATOR);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/trips/${draft.body.id}/approve`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ version: 2 })
      .expect(201);

    const opened = await request(app.getHttpServer())
      .post(`/api/v1/trips/${draft.body.id}/open`)
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .send({ version: 3 })
      .expect(201);

    expect(opened.body.status).toBe('OPEN');

    return { trip: opened.body, carrier };
  }

  it('creates one compatible proposal, transitions the shipment and notifies the Client', async () => {
    const client = await login(createTestPhone());
    const shipment = await createSubmittedShipment(client.accessToken, 2.5);
    const { trip } = await createOpenTrip(5);

    await processor.processBatch(100);
    await processor.processBatch(100);

    const matches = await prisma.match.findMany({
      where: { shipmentId: shipment.id },
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(
      expect.objectContaining({
        tripId: trip.id,
        status: 'PROPOSED',
        score: 100,
      }),
    );

    const updatedShipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
    });
    expect(updatedShipment.status).toBe('MATCHING');
    expect(updatedShipment.version).toBe(3);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/shipments/${shipment.id}/matches`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toEqual(
      expect.objectContaining({
        id: matches[0].id,
        status: 'PROPOSED',
        score: 100,
      }),
    );
    expect(listed.body[0].trip).toEqual(
      expect.objectContaining({
        id: trip.id,
        flightNo: 'AF718',
        availableKg: '5',
      }),
    );

    const notification = await prisma.notification.findFirst({
      where: {
        userId: client.user.id,
        type: 'shipment_matching_started',
        relatedId: shipment.id,
      },
    });
    expect(notification).not.toBeNull();

    const outsider = await login(createTestPhone());

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/shipments/${shipment.id}/matches`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    expect(hidden.body.error.code).toBe('SHIPMENT_NOT_FOUND');

    const openedEvent = await prisma.outboxEvent.findFirstOrThrow({
      where: {
        aggregate: 'trip',
        aggregateId: trip.id,
        eventType: 'trip.opened',
      },
    });

    const duplicate = await prisma.outboxEvent.create({
      data: {
        aggregate: 'trip',
        aggregateId: trip.id,
        eventType: 'trip.opened',
        payload: JSON.parse(
          JSON.stringify(openedEvent.payload),
        ) as Prisma.InputJsonValue,
      },
    });
    extraEventIds.push(duplicate.id);

    await processor.processBatch(100);
    await processor.processBatch(100);

    expect(
      await prisma.match.count({
        where: {
          shipmentId: shipment.id,
          tripId: trip.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.notification.count({
        where: {
          userId: client.user.id,
          type: 'shipment_matching_started',
          relatedId: shipment.id,
        },
      }),
    ).toBe(1);
  });

  it('does not propose a trip whose available capacity is too small', async () => {
    const client = await login(createTestPhone());
    const shipment = await createSubmittedShipment(client.accessToken, 9);

    await processor.processBatch(100);
    await processor.processBatch(100);

    expect(
      await prisma.match.count({
        where: { shipmentId: shipment.id },
      }),
    ).toBe(0);

    const unchanged = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
    });
    expect(unchanged.status).toBe('SUBMITTED');
    expect(unchanged.version).toBe(2);
  });
});
