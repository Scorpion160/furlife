import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { configureApiTestApp } from '../../testing/configure-api-test-app';
import { OtpSenderService } from '../identity/services/otp-sender.service';
import {
  ObjectStorageService,
  type StoredObjectInspection,
} from './object-storage.service';

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

class FakeObjectStorage {
  readonly objects = new Map<string, StoredObjectInspection>();
  readonly deleted: string[] = [];

  createUploadIntent(input: {
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }) {
    return {
      uploadUrl: `https://upload.invalid/${encodeURIComponent(input.objectKey)}`,
      requiredHeaders: {
        'content-type': input.contentType,
        'content-length': input.sizeBytes.toString(),
      },
      expiresAt: '2026-10-29T11:00:00.000Z',
    };
  }

  async inspectImageObject(
    objectKey: string,
    _maxBytes: number,
  ): Promise<StoredObjectInspection> {
    const object = this.objects.get(objectKey);
    if (!object) throw new Error(`Missing fake object: ${objectKey}`);
    return object;
  }

  createDownloadUrl(objectKey: string) {
    return {
      downloadUrl: `https://download.invalid/${encodeURIComponent(objectKey)}`,
      expiresAt: '2026-10-29T11:00:00.000Z',
    };
  }

  async deleteObjectBestEffort(objectKey: string): Promise<void> {
    this.deleted.push(objectKey);
    this.objects.delete(objectKey);
  }
}

describe('Shipment private media vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const otpSender = new CapturingOtpSender();
  const storage = new FakeObjectStorage();
  const challengeIds: string[] = [];
  const phones: string[] = [];
  const shipmentIds: string[] = [];
  const categoryIds: string[] = [];
  const corridorIds: string[] = [];

  let corridorId: string;
  let categoryId: string;

  const deviceId = 'furlife-media-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22175${suffix}`;
    phones.push(phone);
    return phone;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpSenderService)
      .useValue(otpSender)
      .overrideProvider(ObjectStorageService)
      .useValue(storage)
      .compile();

    app = configureApiTestApp(moduleRef.createNestApplication());
    prisma = moduleRef.get(PrismaService);
    await app.init();

    const suffix = randomInt(100_000, 1_000_000).toString();

    const corridor = await prisma.corridor.create({
      data: {
        originCountry: 'SN',
        originCity: `Dakar-media-${suffix}`,
        destinationCountry: 'FR',
        destinationCity: `Paris-media-${suffix}`,
        currency: 'EUR',
        isActive: true,
      },
    });
    corridorId = corridor.id;
    corridorIds.push(corridor.id);

    const category = await prisma.parcelCategory.create({
      data: {
        code: `MEDIA_ALLOWED_${suffix}`,
        label: `Photo autorisée ${suffix}`,
        isAllowed: true,
      },
    });
    categoryId = category.id;
    categoryIds.push(category.id);
  });

  afterAll(async () => {
    if (shipmentIds.length > 0) {
      await prisma.mediaAsset.deleteMany({
        where: { shipmentId: { in: shipmentIds } },
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

  async function createDraft(accessToken: string) {
    const created = await request(app.getHttpServer())
      .post('/api/v1/shipments/drafts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        corridorId,
        parcels: [
          {
            categoryId,
            description: 'Colis avec photo privée',
            declaredWeight: 1.1,
          },
        ],
      })
      .expect(201);

    shipmentIds.push(created.body.id);
    return created.body;
  }

  it('confirms private media idempotently and hides downloads from other clients', async () => {
    const owner = await login(createTestPhone());
    const draft = await createDraft(owner.accessToken);
    const sha256 = 'a'.repeat(64);

    const intent = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.id}/media/upload-intents`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        contentType: 'image/jpeg',
        sizeBytes: 1234,
        sha256,
        purpose: 'DECLARATION_PHOTO',
      })
      .expect(201);

    expect(intent.body.objectKey).toMatch(
      new RegExp(`^shipments/${draft.id}/declaration/.+\\.jpg$`),
    );
    expect(intent.body.uploadUrl).toContain('https://upload.invalid/');
    expect(intent.body.requiredHeaders).toEqual({
      'content-type': 'image/jpeg',
      'content-length': '1234',
    });

    storage.objects.set(intent.body.objectKey, {
      sizeBytes: 1234,
      sha256,
      detectedContentType: 'image/jpeg',
    });

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.id}/media/confirm`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .set('X-Request-Id', 'media-e2e-confirm')
      .send({
        objectKey: intent.body.objectKey,
        contentType: 'image/jpeg',
        sizeBytes: 1234,
        sha256,
        purpose: 'DECLARATION_PHOTO',
      })
      .expect(201);

    expect(confirmed.body).toEqual(
      expect.objectContaining({
        contentType: 'image/jpeg',
        sizeBytes: '1234',
        sha256,
        purpose: 'DECLARATION_PHOTO',
      }),
    );
    expect(confirmed.body.objectKey).toBeUndefined();

    const retry = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.id}/media/confirm`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        objectKey: intent.body.objectKey,
        contentType: 'image/jpeg',
        sizeBytes: 1234,
        sha256,
        purpose: 'DECLARATION_PHOTO',
      })
      .expect(201);

    expect(retry.body.id).toBe(confirmed.body.id);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/shipments/${draft.id}/media`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(confirmed.body.id);

    const auditCount = await prisma.auditLog.count({
      where: {
        entity: 'shipment',
        entityId: draft.id,
        action: 'shipment.media.confirm',
      },
    });
    expect(auditCount).toBe(1);

    const outboxCount = await prisma.outboxEvent.count({
      where: {
        aggregate: 'shipment',
        aggregateId: draft.id,
        eventType: 'shipment.media.confirmed',
      },
    });
    expect(outboxCount).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'shipment',
        entityId: draft.id,
        action: 'shipment.media.confirm',
      },
    });
    expect(audit?.requestId).toBe('media-e2e-confirm');

    const ownerDownload = await request(app.getHttpServer())
      .get(
        `/api/v1/shipments/${draft.id}/media/${confirmed.body.id}/download`,
      )
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(ownerDownload.body.downloadUrl).toContain(
      'https://download.invalid/',
    );

    const outsider = await login(createTestPhone());

    const hidden = await request(app.getHttpServer())
      .get(
        `/api/v1/shipments/${draft.id}/media/${confirmed.body.id}/download`,
      )
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .expect(404);

    expect(hidden.body.error.code).toBe('MEDIA_NOT_FOUND');
  });

  it('deletes an uploaded object when its real digest does not match', async () => {
    const owner = await login(createTestPhone());
    const draft = await createDraft(owner.accessToken);
    const declaredSha256 = 'c'.repeat(64);

    const intent = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.id}/media/upload-intents`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        contentType: 'image/png',
        sizeBytes: 2048,
        sha256: declaredSha256,
        purpose: 'DECLARATION_PHOTO',
      })
      .expect(201);

    storage.objects.set(intent.body.objectKey, {
      sizeBytes: 2048,
      sha256: 'd'.repeat(64),
      detectedContentType: 'image/png',
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/shipments/${draft.id}/media/confirm`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        objectKey: intent.body.objectKey,
        contentType: 'image/png',
        sizeBytes: 2048,
        sha256: declaredSha256,
        purpose: 'DECLARATION_PHOTO',
      })
      .expect(400);

    expect(response.body.error.code).toBe('MEDIA_SHA256_MISMATCH');
    expect(storage.deleted).toContain(intent.body.objectKey);

    const count = await prisma.mediaAsset.count({
      where: { shipmentId: draft.id },
    });
    expect(count).toBe(0);
  });
});
