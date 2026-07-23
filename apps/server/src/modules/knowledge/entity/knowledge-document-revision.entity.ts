import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('knowledge_document_revision')
export class KnowledgeDocumentRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'uuid' })
  documentId!: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceHash!: string | null

  @Column({ type: 'int', default: 0 })
  chunkCount!: number

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null

  @CreateDateColumn()
  createdAt!: Date
}

