import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { PrismaService } from '../../database/prisma.service';
import { OtpSenderService } from './services/otp-sender.service';

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

describe('Identity vertical slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const otpSender = new CapturingOtpSender();
  const challengeIds: string[] = [];
  const phones: string[] = [];

  const deviceId = 'furlife-jest-device';

  const createTestPhone = (): string => {
    const suffix = randomInt(1_000_000, 10_000_000);
    const phone = `+22177${suffix}`;
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
  });

  afterAll(async () => {
    if (challengeIds.length > 0) {
      await prisma.verificationChallenge.deleteMany({
        where: {
          id: {
            in: challengeIds,
          },
        },
      });
    }

    if (phones.length > 0) {
      await prisma.user.deleteMany({
        where: {
          phoneE164: {
            in: phones,
          },
        },
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

    expect(started.body.challengeId).toEqual(expect.any(String));

    challengeIds.push(started.body.challengeId);

    const code = otpSender.codeFor(phoneE164);

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .set('X-Device-Id', deviceId)
      .send({
        challengeId: started.body.challengeId,
        phoneE164,
        code,
      })
      .expect(201);

    expect(verified.body.user.phoneE164).toBe(phoneE164);
    expect(verified.body.user.status).toBe('ACTIVE');
    expect(verified.body.user.roles).toContain('CLIENT');

    expect(verified.body.accessToken).toEqual(expect.any(String));
    expect(verified.body.refreshToken).toEqual(expect.any(String));

    return verified.body;
  }

  it('rotates refresh tokens and revokes the session family on replay', async () => {
    const phone = createTestPhone();
    const initial = await login(phone);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${initial.accessToken}`)
      .set('X-Device-Id', deviceId)
      .expect(200);

    expect(me.body.phoneE164).toBe(phone);
    expect(me.body.roles).toContain('CLIENT');

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Device-Id', deviceId)
      .send({
        refreshToken: initial.refreshToken,
      })
      .expect(201);

    expect(refreshed.body.accessToken).not.toBe(initial.accessToken);
    expect(refreshed.body.refreshToken).not.toBe(initial.refreshToken);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .set('X-Device-Id', deviceId)
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('X-Device-Id', deviceId)
      .send({
        refreshToken: initial.refreshToken,
      })
      .expect(401);

    expect(replay.body.error.code).toBe('AUTH_REFRESH_REUSE_DETECTED');

    const revokedFamily = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .set('X-Device-Id', deviceId)
      .expect(401);

    expect(revokedFamily.body.error.code).toBe(
      'AUTH_INVALID_ACCESS_TOKEN',
    );
  });

  it('revokes the access token on logout', async () => {
    const phone = createTestPhone();
    const session = await login(phone);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('X-Device-Id', deviceId)
      .expect(200);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('X-Device-Id', deviceId)
      .expect(201);

    expect(logout.body).toEqual({
      success: true,
    });

    const rejected = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('X-Device-Id', deviceId)
      .expect(401);

    expect(rejected.body.error.code).toBe(
      'AUTH_INVALID_ACCESS_TOKEN',
    );
  });
});