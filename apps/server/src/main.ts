import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  app.setGlobalPrefix('api')
  app.enableCors({
    origin: configService.get<string>('CLIENT_ORIGIN', 'http://localhost:5173'),
    credentials: true
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  )

  const port = configService.get<number>('PORT', 3001)
  await app.listen(port)
}

bootstrap()
