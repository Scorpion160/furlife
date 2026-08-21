import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { AccessTokenGuard } from './guards/access-token.guard';
import { IdentityService } from './services/identity.service';
import { OtpSenderService } from './services/otp-sender.service';
import { SessionService } from './services/session.service';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, OtpSenderService, SessionService, AccessTokenGuard],
  exports: [SessionService, AccessTokenGuard],
})
export class IdentityModule {}
