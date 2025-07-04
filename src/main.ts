import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, 
    transform: true, 
  }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  // Log client-test.html URL
  console.log('\x1b[36m%s\x1b[0m', `🚀 API server running at: http://localhost:${port}`);
  console.log('\x1b[33m%s\x1b[0m', `🧪 Open your client: file://${process.cwd()}/test-client.html`);
  console.log('\x1b[33m%s\x1b[0m', `Or use Live Server: http://127.0.0.1:5500/test-client.html`);
}
bootstrap();
