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
import { CreateShipmentDraftDto } from './dto/create-shipment-draft.dto';
import { SubmitShipmentDto } from './dto/submit-shipment.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get('options')
  options(@Req() request: AuthenticatedRequest) {
    return this.shipments.options(request.auth!);
  }

  @Get('mine')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.shipments.listMine(request.auth!);
  }

  @Post('drafts')
  @Throttle({ sensitive: { limit: 30, ttl: 60_000 } })
  createDraft(
    @Body() body: CreateShipmentDraftDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.shipments.createDraft(
      request.auth!,
      body,
      response.locals.requestId as string | undefined,
    );
  }

  @Get(':id')
  getMine(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.shipments.getMine(request.auth!, id);
  }

  @Post(':id/submit')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  submit(
    @Param('id') id: string,
    @Body() body: SubmitShipmentDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.shipments.submit(
      request.auth!,
      id,
      body,
      response.locals.requestId as string | undefined,
    );
  }
}
