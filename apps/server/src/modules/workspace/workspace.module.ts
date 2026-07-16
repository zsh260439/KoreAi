import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { KnowledgeModule } from '../knowledge/knowledge.module'
import { WorkspaceChatService } from './chat/workspace-chat.service'
import { WorkspaceConversationService } from './conversation/workspace-conversation.service'
import { WorkspaceController } from './workspace.controller'
import { WorkspaceConversationEntity } from './entity/workspace-conversation.entity'
import { WorkspaceMessageEntity } from './entity/workspace-message.entity'

@Module({
  imports: [
    KnowledgeModule,
    TypeOrmModule.forFeature([WorkspaceConversationEntity, WorkspaceMessageEntity])
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceConversationService, WorkspaceChatService]
})
export class WorkspaceModule {}
