import {
  Controller,
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
import { PricingService } from './pricing.service';

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('shipments/:shipmentId/pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('quote')
  @Throttle({ sensitive: { limit: 20, ttl: 60_000 } })
  quote(
    @Param('shipmentId') shipmentId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.pricing.quote(
      request.auth!,
      shipmentId,
      response.locals.requestId as string | undefined,
    );
  }
}
