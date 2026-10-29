import { NestFactory } from '@nestjs/core';
import { setTimeout as delay } from 'node:timers/promises';
import { AppModule } from '../app.module';
import { OutboxProcessorService } from '../modules/outbox/outbox-processor.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const processor = app.get(OutboxProcessorService);
  let stopping = false;

  const stop = () => {
    stopping = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    while (!stopping) {
      const processed = await processor.processBatch(50);
      if (processed === 0) {
        await delay(1000);
      }
    }
  } finally {
    await app.close();
  }
}

void bootstrap();
