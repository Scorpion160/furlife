import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
}
