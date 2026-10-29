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
import { TransitionTripDto } from './dto/transition-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('admin-trips')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('admin/trips')
export class AdminTripsController {
  constructor(private readonly trips: TripsService) {}

  @Get('pending')
  listPending(@Req() request: AuthenticatedRequest) {
    return this.trips.listPendingForReview(request.auth!);
  }

  @Post(':id/approve')
  @Throttle({ sensitive: { limit: 30, ttl: 60_000 } })
  approve(
    @Param('id') id: string,
    @Body() body: TransitionTripDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.trips.approve(
      request.auth!,
      id,
      body.version,
      response.locals.requestId as string | undefined,
    );
  }
}
