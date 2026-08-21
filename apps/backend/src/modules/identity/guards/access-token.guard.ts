import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionService } from '../services/session.service';
import type { AuthContext } from '../types/auth-context';

export type AuthenticatedRequest = Request & { auth?: AuthContext };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const raw = request.header('authorization');
    const [scheme, token] = raw?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException({
        code: 'AUTH_MISSING_ACCESS_TOKEN',
        message: 'Authentification requise.',
      });
    }

    const resolved = await this.sessions.resolveAccessToken(token);
    request.auth = {
      sessionId: resolved.sessionId,
      userId: resolved.user.id,
      phoneE164: resolved.user.phoneE164,
      locale: resolved.user.locale,
      status: resolved.user.status,
      roles: resolved.user.roles.map((entry) => entry.role),
    };
    return true;
  }
}
