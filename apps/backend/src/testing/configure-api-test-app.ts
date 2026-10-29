import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware';

export function configureApiTestApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );

  return app;
}
