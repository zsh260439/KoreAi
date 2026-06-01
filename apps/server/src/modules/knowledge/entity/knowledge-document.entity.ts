import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { KnowledgeBaseEntity } from './knowledge-base.entity'
import { KnowledgeChunkEntity } from './knowledge-chunk.entity'

export type DocumentSourceType = 'file' | 'url'
export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed'

@Entity('knowledge_document')
export class KnowledgeDocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: 'uuid' })
  knowledgeBaseId!: string

  @Column({type:'varchar',length:255})
  name!: string

  @Column({ type: 'varchar', length: 20 })
  sourceType!: DocumentSourceType

  @Column({ type: 'text', nullable: true })
  sourceLocation!: string | null

  @Column({ type: 'text', nullable: true })
  storagePath!: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  fileType!: string | null

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes!: string | null

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: DocumentStatus

  @Column({ type: 'boolean', default: true })
  enabled!: boolean
  //分块策略
  @Column({ type: 'varchar', length: 50, nullable: true })
  chunkStrategy!: string | null

  @Column({ type: 'jsonb', nullable: true })
  chunkConfig!: Record<string, unknown> | null

  @Column({ type: 'text', nullable: true })
  summary!: string | null

  @Column({ type: 'text', nullable: true })
  contentPreview!: string | null

  @Column({ type: 'int', default: 0 })
  chunkCount!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date


  @ManyToOne(() => KnowledgeBaseEntity, (knowledgeBase) => knowledgeBase.documents, { onDelete: 'CASCADE' })
  @JoinColumn()
  knowledgeBase!: KnowledgeBaseEntity

  @OneToMany(() => KnowledgeChunkEntity, (chunk) => chunk.document)
  chunks!: KnowledgeChunkEntity[]
}
