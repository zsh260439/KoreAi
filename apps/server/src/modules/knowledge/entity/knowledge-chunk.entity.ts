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

  @Column({ type: 'boolean', default: true })
  enabled!: boolean

  @Column({ type: 'int' })
  charCount!: number

  @Column({ type: 'int' })
  tokenCount!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @ManyToOne(() => KnowledgeDocumentEntity, (document) => document.chunks, { onDelete: 'CASCADE' })
  @JoinColumn()
  document!: KnowledgeDocumentEntity
}
