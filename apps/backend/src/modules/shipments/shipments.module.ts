import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ObjectStorageService } from './object-storage.service';
import { ShipmentMediaController } from './shipment-media.controller';
import { ShipmentMediaService } from './shipment-media.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [IdentityModule],
  controllers: [ShipmentsController, ShipmentMediaController],
  providers: [ShipmentsService, ShipmentMediaService, ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ShipmentsModule {}
