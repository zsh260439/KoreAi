import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import { KnowledgeDocumentEntity } from './knowledge-document.entity'

@Entity('knowledge_chunks')
export class KnowledgeChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  documentId!: string

  @Column({ type: 'int' })
  sequence!: number

  @Column({ type: 'text' })
  content!: string

  @Column({ type: 'int' })
  charCount!: number

  @Column({ type: 'int' })
  tokenCount!: number

  @Column({ type: 'jsonb', nullable: true, select: false })
  metadata!: Record<string, unknown> | null

  @Column('vector', { nullable: true, select: false })
  embedding!: number[] | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @ManyToOne(() => KnowledgeDocumentEntity, { onDelete: 'CASCADE' })
  @JoinColumn()
  document!: KnowledgeDocumentEntity
}
