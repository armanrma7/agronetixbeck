import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger/OpenAPI configuration
  const config = new DocumentBuilder()
    .setTitle('AcronetXBeck Authentication API')
    .setDescription('Production-ready NestJS authentication system with OTP verification')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('admin', 'Admin endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Use DigitalOcean PORT or fallback
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

  // Listen on all interfaces
  await app.listen(port, '0.0.0.0');

  console.log(`Application is running on port ${port}`);
  console.log(`Swagger documentation: http://0.0.0.0:${port}/api`);
}

bootstrap();