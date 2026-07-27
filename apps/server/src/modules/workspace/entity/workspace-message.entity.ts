import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm'
import type {
  KnowledgeSearchDebugInfo,
  KnowledgeReasoningStep,
  KnowledgeSearchHit,
  WorkspacePromptCapabilities
} from 'share-type'
import { WorkspaceConversationEntity } from './workspace-conversation.entity'

@Entity('workspace_message')
export class WorkspaceMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  conversationId!: string

  @Column({ type: 'varchar', length: 20 })
  role!: 'user' | 'assistant'

  @Column({ type: 'text' })
  content!: string

  @Column({ type: 'jsonb', nullable: true })
  citations!: KnowledgeSearchHit[] | null

  // 单独保存一次检索调试快照，避免把同一份 debug 冗余复制到每个 citation 里。
  @Column({ type: 'jsonb', nullable: true })
  retrievalDebug!: KnowledgeSearchDebugInfo | null

  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null

  @Column({ type: 'int', nullable: true })
  latencyMs!: number | null

  @Column({ type: 'int', nullable: true })
  totalTokens!: number | null

  @Column({ type: 'jsonb', nullable: true })
  reasoningSteps!: KnowledgeReasoningStep[] | null

  @Column({ type: 'jsonb', nullable: true })
  promptCapabilities!: WorkspacePromptCapabilities | null

  @CreateDateColumn()
  createdAt!: Date

  @ManyToOne(() => WorkspaceConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: WorkspaceConversationEntity
}

