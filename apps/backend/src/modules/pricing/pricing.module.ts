import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AdminPricingController } from './admin-pricing.controller';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [IdentityModule],
  controllers: [PricingController, AdminPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
