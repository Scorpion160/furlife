import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxProcessorService } from './outbox-processor.service';

@Module({
  imports: [NotificationsModule],
  providers: [OutboxProcessorService],
  exports: [OutboxProcessorService],
})
export class OutboxModule {}
