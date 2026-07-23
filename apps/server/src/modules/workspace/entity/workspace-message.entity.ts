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

  // 鍗曠嫭淇濆瓨涓€娆℃绱㈣皟璇曞揩鐓э紝閬垮厤鎶婂悓涓€浠?debug 鍐椾綑澶嶅埗鍒版瘡涓?citation 閲屻€?  @Column({ type: 'jsonb', nullable: true })
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

