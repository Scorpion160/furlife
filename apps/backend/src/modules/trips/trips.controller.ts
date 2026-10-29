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
import { CreateTripDraftDto } from './dto/create-trip-draft.dto';
import { SubmitTripDto } from './dto/submit-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('options')
  options(@Req() request: AuthenticatedRequest) {
    return this.trips.options(request.auth!);
  }

  @Get('mine')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.trips.listMine(request.auth!);
  }

  @Post('drafts')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  createDraft(
    @Body() body: CreateTripDraftDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.trips.createDraft(
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
    return this.trips.getMine(request.auth!, id);
  }

  @Post(':id/submit')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  submit(
    @Param('id') id: string,
    @Body() body: SubmitTripDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.trips.submit(
      request.auth!,
      id,
      body,
      response.locals.requestId as string | undefined,
    );
  }
}
