import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.useBodyParser('json', {
    limit: config.getOrThrow<string>('BODY_LIMIT'),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Smart Logistics Routing API')
    .setDescription(
      'Upload directed road networks and compute optimal routes asynchronously.',
    )
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
