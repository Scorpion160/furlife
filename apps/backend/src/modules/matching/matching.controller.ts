import {
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
import { MatchingService } from './matching.service';

@ApiTags('matching')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('shipments/:shipmentId/matches')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get()
  listForShipment(
    @Param('shipmentId') shipmentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.matching.listForShipment(request.auth!, shipmentId);
  }

  @Post(':matchId/accept')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  accept(
    @Param('shipmentId') shipmentId: string,
    @Param('matchId') matchId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.matching.accept(
      request.auth!,
      shipmentId,
      matchId,
      response.locals.requestId as string | undefined,
    );
  }
}
