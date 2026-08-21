import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { StartPhoneVerificationDto } from './dto/start-phone-verification.dto';
import { VerifyPhoneDto } from './dto/verify-phone.dto';
import { AccessTokenGuard, type AuthenticatedRequest } from './guards/access-token.guard';
import { IdentityService } from './services/identity.service';
import { SessionService } from './services/session.service';

@ApiTags('identity')
@Controller('auth')
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
  ) {}

  @Post('phone/start')
  @Throttle({ sensitive: { limit: 5, ttl: 60_000 } })
  startPhoneVerification(@Body() body: StartPhoneVerificationDto) {
    return this.identity.startPhoneVerification(body);
  }

  @Post('phone/verify')
  @Throttle({ sensitive: { limit: 10, ttl: 60_000 } })
  verifyPhone(@Body() body: VerifyPhoneDto, @Req() request: Request) {
    return this.identity.verifyPhone(body, this.requestMetadata(request));
  }

  @Post('refresh')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  refresh(@Body() body: RefreshSessionDto, @Req() request: Request) {
    return this.sessions.rotate(body.refreshToken, this.requestMetadata(request));
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  async logout(@Req() request: AuthenticatedRequest) {
    const raw = request.header('authorization') ?? '';
    const token = raw.slice(raw.indexOf(' ') + 1);
    await this.sessions.revokeByAccessToken(token);
    return { success: true };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  me(@Req() request: AuthenticatedRequest) {
    const auth = request.auth!;
    return {
      id: auth.userId,
      phoneE164: auth.phoneE164,
      locale: auth.locale,
      status: auth.status,
      roles: auth.roles,
    };
  }

  @Get('capabilities')
  capabilities() {
    return {
      phoneOtp: true,
      password: false,
      adminMfaRequired: true,
      accessTokens: 'opaque',
      refreshTokenRotation: true,
      refreshReuseDetection: true,
    };
  }

  private requestMetadata(request: Request) {
    return {
      deviceId: request.header('x-device-id') ?? undefined,
      userAgent: request.header('user-agent') ?? undefined,
      ipAddress: request.ip || undefined,
    };
  }
}
