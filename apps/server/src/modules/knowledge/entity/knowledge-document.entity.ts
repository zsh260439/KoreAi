import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type {
  StructureAwareChunkConfig,
  KnowledgeDocumentSourceType,
  KnowledgeDocumentStatus
} from 'share-type'
import { KnowledgeBaseEntity } from './knowledge-base.entity'

@Entity('knowledge_document')
export class KnowledgeDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  knowledgeBaseId!: string

  @Column({ type: 'varchar', length: 255 })
  name!: string

  @Column({ type: 'varchar', length: 20 })
  sourceType!: KnowledgeDocumentSourceType

  @Column({ type: 'text', nullable: true })
  storagePath!: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  fileType!: string | null

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes!: string | null

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: KnowledgeDocumentStatus

  @Column({ type: 'jsonb', nullable: true })
  chunkConfig!: StructureAwareChunkConfig | null

  @Column({ type: 'text', nullable: true })
  contentPreview!: string | null

  @Column({ type: 'int', default: 0 })
  chunkCount!: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceHash!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  detectedSourceHash!: string | null

  @Column({ type: 'timestamptz', nullable: true })
  sourceChangedAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  lastAutoSyncAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  purgeAfter!: Date | null

  @Column({ type: 'uuid', nullable: true })
  activeRevisionId!: string | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @ManyToOne(() => KnowledgeBaseEntity, (knowledgeBase) => knowledgeBase.documents, { onDelete: 'CASCADE' })
  @JoinColumn()
  knowledgeBase!: KnowledgeBaseEntity
}

