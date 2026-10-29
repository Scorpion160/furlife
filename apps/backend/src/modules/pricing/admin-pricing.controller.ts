import {
  Body,
  Controller,
  Get,
  Param,
  Put,
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
import { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';
import { PricingService } from './pricing.service';

@ApiTags('admin-pricing')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('admin/pricing-rules')
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.pricing.listRules(request.auth!);
  }

  @Put(':corridorId')
  @Throttle({ sensitive: { limit: 30, ttl: 60_000 } })
  upsert(
    @Param('corridorId') corridorId: string,
    @Body() body: UpsertPricingRuleDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.pricing.upsertRule(
      request.auth!,
      corridorId,
      body,
      response.locals.requestId as string | undefined,
    );
  }
}
