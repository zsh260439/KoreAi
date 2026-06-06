import { Module } from '@nestjs/common'

import { KnowledgeModule } from '../knowledge/knowledge.module'
import { WorkspaceController } from './workspace.controller'
import { WorkspaceService } from './workspace.service'

@Module({
  imports: [KnowledgeModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService]
})
export class WorkspaceModule {}