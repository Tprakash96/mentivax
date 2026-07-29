import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  // Request validation is handled per-route by ZodBody (see src/common),
  // so no global class-validator ValidationPipe is needed.

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Mentivax API listening on http://localhost:${port}/api`);
}

void bootstrap();

