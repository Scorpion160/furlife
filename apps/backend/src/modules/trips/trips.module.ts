import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AdminTripsController } from './admin-trips.controller';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [IdentityModule],
  controllers: [TripsController, AdminTripsController],
  providers: [TripsService],
})
export class TripsModule {}
