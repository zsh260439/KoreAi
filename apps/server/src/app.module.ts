import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AdminModule } from './modules/admin/admin.module'
import { CommonModule } from './modules/common/common.module'
import { KnowledgeModule } from './modules/knowledge/knowl.module'
import { PipelineModule } from './modules/pipeline/pipeline.module'
import { SystemModule } from './modules/system/system.module'
import { TraceModule } from './modules/trace/trace.module'
import { WorkspaceModule } from './modules/workspace/workspace.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env']
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      uuidExtension: 'pgcrypto',
      synchronize: true,
      autoLoadEntities: true
    }),
    CommonModule,
    WorkspaceModule,
    AdminModule,
    TraceModule,
    KnowledgeModule,
    PipelineModule,
    SystemModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
