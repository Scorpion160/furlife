import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/guards/access-token.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(request.auth!, query);
  }

  @Get('unread-count')
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.notifications.unreadCount(request.auth!);
  }

  @Post('read-all')
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.auth!);
  }

  @Post(':id/read')
  markRead(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notifications.markRead(request.auth!, id);
  }
}
