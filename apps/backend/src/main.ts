import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);

  app.enableShutdownHooks();
  const trustProxyHops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }
  app.setGlobalPrefix('api/v1');
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(compression());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );

  const allowedOrigins = config
    .get('CORS_ALLOWED_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length === 0 ? false : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Device-Id'],
    maxAge: 600,
  });

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Furlife API')
      .setDescription('API Furlife — contrat versionné du MVP')
      .setVersion('0.2.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.get('API_PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
