import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { KnowledgeBaseRuntimeConfig, KnowledgeProviderRuntimeConfig } from 'share-type'

@Entity('knowledge_runtime_settings')
export class KnowledgeRuntimeSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 32, unique: true })
  scope!: string

  // 全库搜索的默认参数单独持久化，避免继续只能回退代码常量。
  @Column({ type: 'jsonb', nullable: true })
  runtimeConfig!: KnowledgeBaseRuntimeConfig | null

  // 密钥不入库，只保存模型、地址和 OCR 开关这类可公开的运行覆盖项。
  @Column({ type: 'jsonb', nullable: true })
  providerConfig!: KnowledgeProviderRuntimeConfig | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
