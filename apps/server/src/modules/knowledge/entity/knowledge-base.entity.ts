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

  // 淇濆瓨鐭ヨ瘑搴撶骇杩愯閰嶇疆锛岃鍙洖涓庨棶绛斿弬鏁颁笉鍐嶆暎钀藉湪鐜鍙橀噺鍜?service 甯搁噺閲屻€?  @Column({ type: 'jsonb', nullable: true })
  runtimeConfig!: KnowledgeBaseRuntimeConfig | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @OneToMany(() => KnowledgeDocumentEntity, (document) => document.knowledgeBase)
  documents!: KnowledgeDocumentEntity[]
}

