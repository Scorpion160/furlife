import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [IdentityModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
