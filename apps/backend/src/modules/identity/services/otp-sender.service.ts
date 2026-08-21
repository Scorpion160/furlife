import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema';

@Injectable()
export class OtpSenderService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(phoneE164: string, code: string): Promise<void> {
    const provider = this.config.get('OTP_PROVIDER', { infer: true });
    if (provider === 'disabled') {
      throw new ServiceUnavailableException({
        code: 'OTP_PROVIDER_UNAVAILABLE',
        message: 'Le service de vérification est momentanément indisponible.',
      });
    }

    const expose = this.config.get('OTP_DEV_EXPOSE_CODE', { infer: true });
    const appEnv = this.config.get('APP_ENV', { infer: true });
    if (!expose || (appEnv !== 'development' && appEnv !== 'test')) {
      throw new ServiceUnavailableException({
        code: 'OTP_PROVIDER_MISCONFIGURED',
        message: 'Le fournisseur OTP de développement est désactivé.',
      });
    }

    // Development-only adapter. Never enabled in staging/production.
    process.stdout.write(`[FURLIFE_DEV_OTP] ${phoneE164} -> ${code}\n`);
  }
}
