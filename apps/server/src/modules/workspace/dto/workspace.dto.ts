import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'
import type { CreateWorkspaceConversationInput, WorkspaceChatInput } from 'share-type'

export class CreateWorkspaceConversationDto implements CreateWorkspaceConversationInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string
}

export class WorkspaceChatDto implements WorkspaceChatInput {
  @IsOptional()
  @IsString()
  conversationId?: string

  @IsString()
  query!: string

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string

  @IsOptional()
  @IsBoolean()
  think?: boolean

  @IsOptional()
  @IsBoolean()
  regenerate?: boolean
}
