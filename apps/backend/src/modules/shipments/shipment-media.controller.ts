import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/guards/access-token.guard';
import { ConfirmMediaUploadDto } from './dto/confirm-media-upload.dto';
import { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { ShipmentMediaService } from './shipment-media.service';

@ApiTags('shipment-media')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('shipments/:shipmentId/media')
export class ShipmentMediaController {
  constructor(private readonly media: ShipmentMediaService) {}

  @Get()
  list(
    @Param('shipmentId') shipmentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.list(request.auth!, shipmentId);
  }

  @Post('upload-intents')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  createUploadIntent(
    @Param('shipmentId') shipmentId: string,
    @Body() body: CreateMediaUploadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.createUploadIntent(request.auth!, shipmentId, body);
  }

  @Post('confirm')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  confirm(
    @Param('shipmentId') shipmentId: string,
    @Body() body: ConfirmMediaUploadDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.media.confirm(
      request.auth!,
      shipmentId,
      body,
      response.locals.requestId as string | undefined,
    );
  }

  @Get(':mediaId/download')
  download(
    @Param('shipmentId') shipmentId: string,
    @Param('mediaId') mediaId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.download(request.auth!, shipmentId, mediaId);
  }
}
