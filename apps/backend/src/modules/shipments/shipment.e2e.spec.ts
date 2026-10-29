import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../database/prisma.service';
import { OtpSenderService } from '../identity/services/otp-sender.service';

class CapturingOtpSender {
  private readonly codes = new Map<string, string>();

  async send(phoneE164: string, code: string): Promise<void> {
    this.codes.set(phoneE164, code);
  }

  codeFor(phoneE164: string): string {
    const code = this.codes.get(phoneE164);

    if (!code) {
      throw new Error(`OTP not captured for ${phoneE164}`);
    }

    return code;
  }
}

describe('Shipment draft vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const otpSender = new CapturingOtpSender();
  const challengeIds: string[] = [];
  const phones: string[] = [];
  const shipmentIds: string[] = [];
  const categoryIds: string[] = [];
  const corridorIds: string[] = [];

  let activeCorridorId: string;
  let allowedCategoryId: string;
  let blockedCategoryId: string;

  const deviceId = 'furlife-shipment-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22176${suffix}`;
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

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        stopAtFirstError: false,
      }),
    );

    prisma = moduleRef.get(PrismaService);
    await app.init();

    const suffix = randomInt(100_000, 1_000_000).toString();

    const corridor = await prisma.corridor.create({
      data: {
        originCountry: 'SN',
        originCity: `Dakar-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });
    activeCorridorId = corridor.id;
    corridorIds.push(corridor.id);

    const allowedCategory = await prisma.parcelCategory.create({
      data: {
        code: `TEST_ALLOWED_${suffix}`,
        label: `Catégorie autorisée ${suffix}`,
        isAllowed: true,
        constraints: { fragileAllowed: false },
      },
    });
    allowedCategoryId = allowedCategory.id;
    categoryIds.push(allowedCategory.id);

    const blockedCategory = await prisma.parcelCategory.create({
      data: {
        code: `TEST_BLOCKED_${suffix}`,
        label: `Catégorie bloquée ${suffix}`,
        isAllowed: false,
      },
    });
    blockedCategoryId = blockedCategory.id;
    categoryIds.push(blockedCategory.id);
  });

  afterAll(async () => {
    if (shipmentIds.length > 0) {
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
      await prisma.shipment.deleteMany({
        where: { id: { in: shipmentIds } },
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

  it('requires authentication for shipment options', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/shipments/options')
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_MISSING_ACCESS_TOKEN');
  });

  it('creates, lists, protects and submits a client shipment draft', async () => {
    const owner = await login(createTestPhone());

    const options = await request(app.getHttpServer())
      .get('/api/v1/shipments/options')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(options.body.corridors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activeCorridorId }),
      ]),
    );
    expect(options.body.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: allowedCategoryId }),
      ]),
    );
    expect(options.body.categories).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: blockedCategoryId }),
      ]),
    );

    const created = await request(app.getHttpServer())
      .post('/api/v1/shipments/drafts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Request-Id', 'shipment-e2e-create')
      .send({
        corridorId: activeCorridorId,
        declaredValue: 25000.5,
        parcels: [
          {
            categoryId: allowedCategoryId,
            description: 'Vêtements personnels',
            declaredWeight: 1.25,
          },
        ],
      })
      .expect(201);

    shipmentIds.push(created.body.id);

    expect(created.body.publicRef).toMatch(/^FL-[A-F0-9]{12}$/);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.version).toBe(1);
    expect(created.body.declaredValue).toBe('25000.5');
    expect(created.body.parcels).toHaveLength(1);
    expect(created.body.parcels[0].declaredWeight).toBe('1.25');

    const mine = await request(app.getHttpServer())
      .get('/api/v1/shipments/mine')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(mine.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.body.id,
          publicRef: created.body.publicRef,
          status: 'DRAFT',
        }),
      ]),
    );

    const outsider = await login(createTestPhone());

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/shipments/${created.body.id}`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    expect(hidden.body.error.code).toBe('SHIPMENT_NOT_FOUND');

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Request-Id', 'shipment-e2e-submit')
      .send({ version: 1 })
      .expect(201);

    expect(submitted.body.status).toBe('SUBMITTED');
    expect(submitted.body.version).toBe(2);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        aggregate: 'shipment',
        aggregateId: created.body.id,
        eventType: 'shipment.submitted',
      },
    });
    expect(outbox).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'shipment',
        entityId: created.body.id,
        action: 'shipment.submit',
      },
    });
    expect(audit?.requestId).toBe('shipment-e2e-submit');

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ version: 1 })
      .expect(409);

    expect(replay.body.error.code).toBe('SHIPMENT_NOT_DRAFT');
  });

  it('rejects a draft containing a disallowed parcel category', async () => {
    const owner = await login(createTestPhone());

    const response = await request(app.getHttpServer())
      .post('/api/v1/shipments/drafts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        corridorId: activeCorridorId,
        parcels: [
          {
            categoryId: blockedCategoryId,
            description: 'Objet non autorisé',
            declaredWeight: 0.5,
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe('SHIPMENT_CATEGORY_UNAVAILABLE');
  });
});
