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

describe('Pricing quotes vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const otpSender = new CapturingOtpSender();
  const phones: string[] = [];
  const challengeIds: string[] = [];
  const shipmentIds: string[] = [];
  const tripIds: string[] = [];
  const matchIds: string[] = [];
  const corridorIds: string[] = [];
  const categoryIds: string[] = [];
  const ruleIds: string[] = [];

  let corridorId: string;
  let categoryId: string;
  let carrierId: string;
  const deviceId = 'furlife-pricing-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22173${suffix}`;
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
        originCity: `Dakar-price-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-price-${suffix}`,
        currency: 'XOF',
        isActive: true,
      },
    });
    corridorId = corridor.id;
    corridorIds.push(corridor.id);

    const category = await prisma.parcelCategory.create({
      data: {
        code: `PRICE_ALLOWED_${suffix}`,
        label: `Tarification ${suffix}`,
        isAllowed: true,
      },
    });
    categoryId = category.id;
    categoryIds.push(category.id);

    const carrier = await login(createTestPhone());
    carrierId = carrier.user.id;
    await prisma.userRoleAssignment.create({
      data: {
        userId: carrierId,
        role: UserRole.CARRIER,
      },
    });
  });

  afterAll(async () => {
    if (shipmentIds.length > 0) {
      await prisma.pricingQuote.deleteMany({
        where: { shipmentId: { in: shipmentIds } },
      });
    }

    if (ruleIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entity: 'pricing_rule',
          entityId: { in: ruleIds },
        },
      });
    }

    await prisma.auditLog.deleteMany({
      where: {
        entity: 'pricing_quote',
      },
    });

    if (matchIds.length > 0) {
      await prisma.match.deleteMany({
        where: { id: { in: matchIds } },
      });
    }

    if (shipmentIds.length > 0) {
      await prisma.shipment.deleteMany({
        where: { id: { in: shipmentIds } },
      });
    }

    if (tripIds.length > 0) {
      await prisma.trip.deleteMany({
        where: { id: { in: tripIds } },
      });
    }

    if (ruleIds.length > 0) {
      await prisma.pricingRule.deleteMany({
        where: { id: { in: ruleIds } },
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

  async function createMatchedShipment(clientId: string, weightKg: number) {
    const suffix = randomInt(100_000, 1_000_000).toString();

    const trip = await prisma.trip.create({
      data: {
        carrierId,
        corridorId,
        flightNo: `PX${suffix.slice(0, 3)}`,
        departureAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ),
        capacityKg: 20,
        reservedKg: weightKg,
        status: 'OPEN',
      },
    });
    tripIds.push(trip.id);

    const shipment = await prisma.shipment.create({
      data: {
        publicRef: `FL-PRICE-${suffix}`,
        clientId,
        corridorId,
        status: 'MATCHED',
        version: 4,
        parcels: {
          create: [
            {
              categoryId,
              description: 'Colis tarifé',
              declaredWeight: weightKg,
            },
          ],
        },
      },
    });
    shipmentIds.push(shipment.id);

    const match = await prisma.match.create({
      data: {
        shipmentId: shipment.id,
        tripId: trip.id,
        score: 100,
        status: 'ACCEPTED',
      },
    });
    matchIds.push(match.id);

    return { shipment, match };
  }

  it('creates immutable server-side quotes and versions pricing rules', async () => {
    const client = await login(createTestPhone());
    const outsider = await login(createTestPhone());
    const operator = await login(createTestPhone());

    await prisma.userRoleAssignment.create({
      data: {
        userId: operator.user.id,
        role: UserRole.OPERATOR,
      },
    });

    const denied = await request(app.getHttpServer())
      .put(`/api/v1/admin/pricing-rules/${corridorId}`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        baseFee: '500',
        pricePerKg: '100',
        minimumFee: '1000',
        isActive: true,
      })
      .expect(403);

    expect(denied.body.error.code).toBe('PRICING_OPERATOR_ROLE_REQUIRED');

    const createdRule = await request(app.getHttpServer())
      .put(`/api/v1/admin/pricing-rules/${corridorId}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .set('X-Request-Id', 'pricing-e2e-create-rule')
      .send({
        baseFee: '500',
        pricePerKg: '100',
        minimumFee: '1000',
        isActive: true,
      })
      .expect(200);

    ruleIds.push(createdRule.body.id);

    expect(createdRule.body).toEqual(
      expect.objectContaining({
        corridorId,
        baseFee: '500',
        pricePerKg: '100',
        minimumFee: '1000',
        currency: 'XOF',
        isActive: true,
        version: 1,
      }),
    );

    const first = await createMatchedShipment(client.user.id, 1);

    const hidden = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${first.shipment.id}/pricing/quote`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    expect(hidden.body.error.code).toBe('SHIPMENT_NOT_FOUND');

    const firstQuote = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${first.shipment.id}/pricing/quote`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .set('X-Request-Id', 'pricing-e2e-first-quote')
      .expect(201);

    expect(firstQuote.body).toEqual(
      expect.objectContaining({
        shipmentId: first.shipment.id,
        matchId: first.match.id,
        currency: 'XOF',
        weightKg: '1',
        baseFee: '500',
        variableFee: '100',
        totalAmount: '1000',
        ruleVersion: 1,
      }),
    );

    const retry = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${first.shipment.id}/pricing/quote`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(201);

    expect(retry.body.id).toBe(firstQuote.body.id);

    expect(
      await prisma.auditLog.count({
        where: {
          entity: 'pricing_quote',
          entityId: firstQuote.body.id,
          action: 'pricing.quote.create',
        },
      }),
    ).toBe(1);

    const updatedRule = await request(app.getHttpServer())
      .put(`/api/v1/admin/pricing-rules/${corridorId}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({
        baseFee: '1000',
        pricePerKg: '500',
        minimumFee: '0',
        isActive: true,
        version: 1,
      })
      .expect(200);

    expect(updatedRule.body.version).toBe(2);

    const oldQuoteAfterRuleChange = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${first.shipment.id}/pricing/quote`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(201);

    expect(oldQuoteAfterRuleChange.body.id).toBe(firstQuote.body.id);
    expect(oldQuoteAfterRuleChange.body.totalAmount).toBe('1000');
    expect(oldQuoteAfterRuleChange.body.ruleVersion).toBe(1);

    const second = await createMatchedShipment(client.user.id, 2);

    const secondQuote = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${second.shipment.id}/pricing/quote`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .expect(201);

    expect(secondQuote.body).toEqual(
      expect.objectContaining({
        shipmentId: second.shipment.id,
        weightKg: '2',
        baseFee: '1000',
        variableFee: '1000',
        totalAmount: '2000',
        ruleVersion: 2,
      }),
    );

    const staleUpdate = await request(app.getHttpServer())
      .put(`/api/v1/admin/pricing-rules/${corridorId}`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({
        baseFee: '1',
        pricePerKg: '1',
        minimumFee: '1',
        isActive: true,
        version: 1,
      })
      .expect(409);

    expect(staleUpdate.body.error.code).toBe(
      'PRICING_RULE_VERSION_CONFLICT',
    );
  });
});
