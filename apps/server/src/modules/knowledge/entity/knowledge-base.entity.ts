import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { KnowledgeBaseStatus } from 'share-type'
import { KnowledgeDocumentEntity } from './knowledge-document.entity'

@Entity('knowledge_bases')
export class KnowledgeBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'text', nullable: true })
  description!: string | null

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: KnowledgeBaseStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @OneToMany(() => KnowledgeDocumentEntity, (document) => document.knowledgeBase)
  documents!: KnowledgeDocumentEntity[]
}
