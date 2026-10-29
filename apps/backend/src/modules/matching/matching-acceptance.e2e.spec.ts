import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
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

describe('Matching acceptance vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: OutboxProcessorService;

  const otpSender = new CapturingOtpSender();
  const phones: string[] = [];
  const challengeIds: string[] = [];
  const shipmentIds: string[] = [];
  const tripIds: string[] = [];
  const matchIds: string[] = [];
  const corridorIds: string[] = [];
  const categoryIds: string[] = [];

  let corridorId: string;
  let categoryId: string;
  const deviceId = 'furlife-match-accept-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22172${suffix}`;
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
        originCity: `Dakar-accept-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-accept-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });
    corridorId = corridor.id;
    corridorIds.push(corridor.id);

    const category = await prisma.parcelCategory.create({
      data: {
        code: `MATCH_ACCEPT_${suffix}`,
        label: `Acceptation matching ${suffix}`,
        isAllowed: true,
      },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
  });

  afterAll(async () => {
    if (matchIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: {
          aggregate: 'match',
          aggregateId: { in: matchIds },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entity: 'match',
          entityId: { in: matchIds },
        },
      });
    }

    if (shipmentIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          relatedType: 'shipment',
          relatedId: { in: shipmentIds },
        },
      });
      await prisma.outboxEvent.deleteMany({
        where: {
          aggregate: 'shipment',
          aggregateId: { in: shipmentIds },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entity: 'shipment',
          entityId: { in: shipmentIds },
        },
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
    }

    if (shipmentIds.length > 0) {
      await prisma.match.deleteMany({
        where: { shipmentId: { in: shipmentIds } },
      });
      await prisma.shipment.deleteMany({
        where: { id: { in: shipmentIds } },
      });
    }

    if (tripIds.length > 0) {
      await prisma.trip.deleteMany({
        where: { id: { in: tripIds } },
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

  async function createSubmittedShipment(accessToken: string, weightKg: number) {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/shipments/drafts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        corridorId,
        parcels: [
          {
            categoryId,
            description: 'Colis pour réservation concurrente',
            declaredWeight: weightKg,
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

    return submitted.body;
  }

  async function createOpenTrip(capacityKg: number) {
    const carrier = await login(createTestPhone());
    await grantRole(carrier.user.id, UserRole.CARRIER);

    const draft = await request(app.getHttpServer())
      .post('/api/v1/trips/drafts')
      .set('Authorization', `Bearer ${carrier.accessToken}`)
      .send({
        corridorId,
        flightNo: 'HC 403',
        departureAt: new Date(
          Date.now() + 9 * 24 * 60 * 60 * 1000,
        ).toISOString(),
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

    return { carrier, trip: opened.body };
  }

  async function drainOutbox() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const processed = await processor.processBatch(100);
      if (processed === 0) break;
    }
  }

  it('reserves capacity atomically when two Clients accept competing matches', async () => {
    const firstClient = await login(createTestPhone());
    const secondClient = await login(createTestPhone());

    const firstShipment = await createSubmittedShipment(
      firstClient.accessToken,
      3,
    );
    const secondShipment = await createSubmittedShipment(
      secondClient.accessToken,
      3,
    );
    const { carrier, trip } = await createOpenTrip(5);

    await drainOutbox();

    const proposals = await prisma.match.findMany({
      where: {
        tripId: trip.id,
        status: 'PROPOSED',
        shipmentId: {
          in: [firstShipment.id, secondShipment.id],
        },
      },
      orderBy: { shipmentId: 'asc' },
    });

    expect(proposals).toHaveLength(2);
    matchIds.push(...proposals.map((proposal) => proposal.id));

    const firstMatch = proposals.find(
      (proposal) => proposal.shipmentId === firstShipment.id,
    )!;
    const secondMatch = proposals.find(
      (proposal) => proposal.shipmentId === secondShipment.id,
    )!;

    const [firstResponse, secondResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(
          `/api/v1/shipments/${firstShipment.id}/matches/${firstMatch.id}/accept`,
        )
        .set('Authorization', `Bearer ${firstClient.accessToken}`)
        .set('X-Request-Id', 'match-accept-first'),
      request(app.getHttpServer())
        .post(
          `/api/v1/shipments/${secondShipment.id}/matches/${secondMatch.id}/accept`,
        )
        .set('Authorization', `Bearer ${secondClient.accessToken}`)
        .set('X-Request-Id', 'match-accept-second'),
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([
      201, 409,
    ]);

    const winner =
      firstResponse.status === 201
        ? {
            response: firstResponse,
            client: firstClient,
            shipment: firstShipment,
            match: firstMatch,
          }
        : {
            response: secondResponse,
            client: secondClient,
            shipment: secondShipment,
            match: secondMatch,
          };

    const loser =
      firstResponse.status === 409
        ? {
            response: firstResponse,
            shipment: firstShipment,
            match: firstMatch,
          }
        : {
            response: secondResponse,
            shipment: secondShipment,
            match: secondMatch,
          };

    expect(winner.response.body.status).toBe('ACCEPTED');
    expect([
      'MATCH_CAPACITY_CHANGED',
      'MATCH_CAPACITY_UNAVAILABLE',
    ]).toContain(loser.response.body.error.code);

    const updatedTrip = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
    });
    expect(updatedTrip.reservedKg.toString()).toBe('3');
    expect(updatedTrip.status).toBe('OPEN');

    const refreshedMatches = await prisma.match.findMany({
      where: { id: { in: [firstMatch.id, secondMatch.id] } },
    });
    expect(
      refreshedMatches.filter((entry) => entry.status === 'ACCEPTED'),
    ).toHaveLength(1);
    expect(
      refreshedMatches.filter((entry) => entry.status === 'PROPOSED'),
    ).toHaveLength(1);

    const winningShipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: winner.shipment.id },
    });
    expect(winningShipment.status).toBe('MATCHED');
    expect(winningShipment.version).toBe(4);

    const losingShipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: loser.shipment.id },
    });
    expect(losingShipment.status).toBe('MATCHING');
    expect(losingShipment.version).toBe(3);

    const retry = await request(app.getHttpServer())
      .post(
        `/api/v1/shipments/${winner.shipment.id}/matches/${winner.match.id}/accept`,
      )
      .set('Authorization', `Bearer ${winner.client.accessToken}`)
      .expect(201);

    expect(retry.body.id).toBe(winner.match.id);
    expect(retry.body.status).toBe('ACCEPTED');

    const tripAfterRetry = await prisma.trip.findUniqueOrThrow({
      where: { id: trip.id },
    });
    expect(tripAfterRetry.reservedKg.toString()).toBe('3');

    await drainOutbox();

    expect(
      await prisma.notification.count({
        where: {
          userId: winner.client.user.id,
          type: 'match_accepted',
          relatedId: winner.shipment.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.notification.count({
        where: {
          userId: carrier.user.id,
          type: 'match_assigned',
          relatedId: trip.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.auditLog.count({
        where: {
          entity: 'match',
          entityId: winner.match.id,
          action: 'match.accept',
        },
      }),
    ).toBe(1);
  });
});
