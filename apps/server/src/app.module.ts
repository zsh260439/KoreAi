import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AdminModule } from './modules/admin/admin.module'
import { CommonModule } from './modules/common/common.module'
import { KnowledgeModule } from './modules/knowledge/knowl.module'
import { PipelineModule } from './modules/pipeline/pipeline.module'
import { SystemModule } from './modules/system/system.module'
import { TraceModule } from './modules/trace/trace.module'
import { WorkspaceModule } from './modules/workspace/workspace.module'
import { TypeOrmModule } from '@nestjs/typeorm'


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env']
    }),
    TypeOrmModule.forRoot({
      url: process.env.DATABASE_URL,
      type: 'postgres',
      synchronize: true, //开发自动建表
      autoLoadEntities: true,//自动加载实体
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
