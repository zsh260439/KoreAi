import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { KnowledgeBaseRuntimeConfig, KnowledgeBaseStatus } from 'share-type'

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

  // 保存知识库级运行配置，让召回与问答参数不再散落在环境变量和 service 常量里。
  @Column({ type: 'jsonb', nullable: true })
  runtimeConfig!: KnowledgeBaseRuntimeConfig | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @OneToMany(() => KnowledgeDocumentEntity, (document) => document.knowledgeBase)
  documents!: KnowledgeDocumentEntity[]
}
