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

  @Column({ type: 'uuid', nullable: true })
  knowledgeBaseId!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  documentName!: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  fileType!: string | null

  @Column({ type: 'varchar', length: 50, nullable: true })
  sourceKind!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  primaryTitle!: string | null

  @Column({ type: 'text', nullable: true })
  sectionPath!: string | null

  @Column({ type: 'text', nullable: true })
  blockTypes!: string | null

  @Column({ type: 'int' })
  sequence!: number

  @Column({ type: 'text' })
  content!: string

  @Column({ type: 'int' })
  charCount!: number

  @Column({ type: 'int' })
  tokenCount!: number

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash!: string | null

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
