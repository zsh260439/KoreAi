import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { resolve } from 'node:path'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { KnowledgeModule } from './modules/knowledge/knowledge.module'
import { WorkspaceModule } from './modules/workspace/workspace.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(__dirname, '../.env.local'),
        resolve(__dirname, '../.env')
      ]
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      uuidExtension: 'pgcrypto',
      synchronize: false,
      autoLoadEntities: true
    }),
    WorkspaceModule,
    KnowledgeModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
