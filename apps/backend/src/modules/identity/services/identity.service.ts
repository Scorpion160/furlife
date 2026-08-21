import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { constantTimeHexEqual, hmacSha256 } from '../../../common/crypto/hash.util';
import type { Env } from '../../../config/env.schema';
import { PrismaService } from '../../../database/prisma.service';
import type { StartPhoneVerificationDto } from '../dto/start-phone-verification.dto';
import type { VerifyPhoneDto } from '../dto/verify-phone.dto';
import { OtpSenderService } from './otp-sender.service';
import { SessionService, type SessionTokens } from './session.service';

interface RequestMetadata {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly otpSender: OtpSenderService,
    private readonly sessions: SessionService,
  ) {}

  async startPhoneVerification(input: StartPhoneVerificationDto) {
    const now = new Date();
    const destinationHash = this.destinationHash(input.phoneE164);
    const cooldownMs =
      this.config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true }) * 1000;
    const cooldownSince = new Date(now.getTime() - cooldownMs);

    const recent = await this.prisma.verificationChallenge.findFirst({
      where: {
        destinationHash,
        purpose: 'SIGN_IN',
        consumedAt: null,
        createdAt: { gte: cooldownSince },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new HttpException(
        {
          code: 'OTP_RESEND_TOO_SOON',
          message: 'Un code a déjà été envoyé récemment. Réessayez dans quelques instants.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const ttlMs = this.config.get('OTP_TTL_SECONDS', { infer: true }) * 1000;
    const expiresAt = new Date(now.getTime() + ttlMs);
    const codeHash = hmacSha256(
      this.config.get('OTP_HASH_SECRET', { infer: true }),
      `${destinationHash}:${code}`,
    );

    const challenge = await this.prisma.verificationChallenge.create({
      data: {
        destinationHash,
        purpose: 'SIGN_IN',
        codeHash,
        maxAttempts: this.config.get('OTP_MAX_ATTEMPTS', { infer: true }),
        expiresAt,
      },
    });

    try {
      await this.otpSender.send(input.phoneE164, code);
    } catch (error) {
      await this.prisma.verificationChallenge.delete({ where: { id: challenge.id } });
      throw error;
    }

    return {
      challengeId: challenge.id,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(now.getTime() + cooldownMs).toISOString(),
    };
  }

  async verifyPhone(input: VerifyPhoneDto, metadata: RequestMetadata) {
    const challenge = await this.prisma.verificationChallenge.findUnique({
      where: { id: input.challengeId },
    });
    const now = new Date();
    if (
      !challenge ||
      challenge.purpose !== 'SIGN_IN' ||
      challenge.consumedAt ||
      challenge.expiresAt <= now
    ) {
      throw this.invalidOtp('OTP_INVALID_OR_EXPIRED', 'Le code est invalide ou a expiré.');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw this.invalidOtp('OTP_ATTEMPTS_EXCEEDED', 'Trop de tentatives ont été effectuées.');
    }

    const destinationHash = this.destinationHash(input.phoneE164);
    if (!constantTimeHexEqual(destinationHash, challenge.destinationHash)) {
      await this.incrementAttempts(challenge.id);
      throw this.invalidOtp('OTP_INVALID_OR_EXPIRED', 'Le code est invalide ou a expiré.');
    }

    const candidateHash = hmacSha256(
      this.config.get('OTP_HASH_SECRET', { infer: true }),
      `${destinationHash}:${input.code}`,
    );
    if (!constantTimeHexEqual(candidateHash, challenge.codeHash)) {
      await this.incrementAttempts(challenge.id);
      throw this.invalidOtp('OTP_INVALID_OR_EXPIRED', 'Le code est invalide ou a expiré.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.verificationChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw this.invalidOtp('OTP_ALREADY_USED', 'Ce code a déjà été utilisé.');
      }

      const baseUser = await tx.user.upsert({
        where: { phoneE164: input.phoneE164 },
        update: { status: 'ACTIVE' },
        create: { phoneE164: input.phoneE164, status: 'ACTIVE' },
      });

      await tx.userRoleAssignment.upsert({
        where: {
          userId_role_scope: { userId: baseUser.id, role: 'CLIENT', scope: '' },
        },
        update: {},
        create: { userId: baseUser.id, role: 'CLIENT', scope: '' },
      });

      const user = await tx.user.findUniqueOrThrow({
        where: { id: baseUser.id },
        include: { roles: { select: { role: true } } },
      });
      const tokens = await this.sessions.issueForUserInTransaction(tx, user.id, metadata);
      return { user, tokens };
    });

    return this.authResponse(result.user, result.tokens);
  }

  private authResponse(
    user: { id: string; phoneE164: string; locale: string; status: string; roles: { role: string }[] },
    tokens: SessionTokens,
  ) {
    return {
      ...tokens,
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        locale: user.locale,
        status: user.status,
        roles: user.roles.map((entry) => entry.role),
      },
    };
  }

  private destinationHash(phoneE164: string): string {
    return hmacSha256(
      this.config.get('PRIVACY_HASH_SECRET', { infer: true }),
      phoneE164,
    );
  }

  private async incrementAttempts(id: string): Promise<void> {
    await this.prisma.verificationChallenge.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  private invalidOtp(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }
}
