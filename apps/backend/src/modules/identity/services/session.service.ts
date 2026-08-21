import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, User, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hmacSha256, randomOpaqueToken, sha256 } from '../../../common/crypto/hash.util';
import type { Env } from '../../../config/env.schema';
import { PrismaService } from '../../../database/prisma.service';

export interface SessionTokens {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

interface SessionMetadata {
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issueForUser(userId: string, metadata: SessionMetadata = {}): Promise<SessionTokens> {
    return this.issueForUserInTransaction(this.prisma, userId, metadata);
  }

  async issueForUserInTransaction(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    metadata: SessionMetadata = {},
  ): Promise<SessionTokens> {
    const familyId = randomUUID();
    return this.createSession(tx, userId, familyId, metadata);
  }

  async rotate(refreshToken: string, metadata: SessionMetadata = {}): Promise<SessionTokens> {
    const refreshTokenHash = sha256(refreshToken);
    const current = await this.prisma.session.findUnique({ where: { refreshTokenHash } });
    if (!current) {
      throw this.unauthorized('AUTH_INVALID_REFRESH_TOKEN', 'Session invalide ou expirée.');
    }

    const now = new Date();
    if (current.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: current.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      throw this.unauthorized(
        'AUTH_REFRESH_REUSE_DETECTED',
        'Cette session a été invalidée par mesure de sécurité.',
      );
    }
    if (current.refreshExpiresAt <= now) {
      await this.prisma.session.update({ where: { id: current.id }, data: { revokedAt: now } });
      throw this.unauthorized('AUTH_REFRESH_EXPIRED', 'La session a expiré.');
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.session.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) {
        await tx.session.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        throw this.unauthorized(
          'AUTH_REFRESH_REUSE_DETECTED',
          'Cette session a été invalidée par mesure de sécurité.',
        );
      }

      const tokens = await this.createSession(tx, current.userId, current.familyId, {
        deviceId: metadata.deviceId,
        userAgent: metadata.userAgent ?? current.userAgent ?? undefined,
        ipAddress: metadata.ipAddress,
      });
      const replacement = await tx.session.findUniqueOrThrow({
        where: { accessTokenHash: sha256(tokens.accessToken) },
        select: { id: true },
      });
      await tx.session.update({
        where: { id: current.id },
        data: { replacedById: replacement.id },
      });
      return tokens;
    });
  }

  async revokeByAccessToken(accessToken: string): Promise<void> {
    const now = new Date();
    await this.prisma.session.updateMany({
      where: { accessTokenHash: sha256(accessToken), revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async resolveAccessToken(accessToken: string): Promise<{
    sessionId: string;
    user: User & { roles: { role: UserRole }[] };
  }> {
    const session = await this.prisma.session.findUnique({
      where: { accessTokenHash: sha256(accessToken) },
      include: { user: { include: { roles: { select: { role: true } } } } },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.accessExpiresAt <= now) {
      throw this.unauthorized('AUTH_INVALID_ACCESS_TOKEN', 'Authentification requise.');
    }
    if (session.user.status !== 'ACTIVE') {
      throw this.unauthorized('AUTH_USER_INACTIVE', 'Ce compte ne peut pas être utilisé.');
    }
    return { sessionId: session.id, user: session.user };
  }

  private async createSession(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    familyId: string,
    metadata: SessionMetadata,
  ): Promise<SessionTokens> {
    const accessToken = randomOpaqueToken();
    const refreshToken = randomOpaqueToken(48);
    const now = Date.now();
    const accessExpiresAt = new Date(
      now + this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
    );
    const refreshExpiresAt = new Date(
      now + this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true }) * 1000,
    );
    const privacySecret = this.config.get('PRIVACY_HASH_SECRET', { infer: true });

    await tx.session.create({
      data: {
        userId,
        familyId,
        accessTokenHash: sha256(accessToken),
        refreshTokenHash: sha256(refreshToken),
        deviceIdHash: metadata.deviceId ? hmacSha256(privacySecret, metadata.deviceId) : null,
        ipHash: metadata.ipAddress ? hmacSha256(privacySecret, metadata.ipAddress) : null,
        userAgent: metadata.userAgent?.slice(0, 512),
        accessExpiresAt,
        refreshExpiresAt,
      },
    });

    return {
      accessToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshToken,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private unauthorized(code: string, message: string): UnauthorizedException {
    return new UnauthorizedException({ code, message });
  }
}
