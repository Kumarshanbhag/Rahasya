import './env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

/** The request pipeline, shared by the server and the e2e tests. */
export function setup(app: NestExpressApplication) {
  app.set('trust proxy', 1); // the host terminates TLS; IP rate limits need the client's address
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const origins = process.env.CORS_ORIGINS?.split(',').filter(Boolean);
  if (origins?.length) app.enableCors({ origin: origins });
  app.enableShutdownHooks();
  return app;
}

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await setup(app).listen(process.env.PORT ?? 3000);
}

if (require.main === module) void main();
