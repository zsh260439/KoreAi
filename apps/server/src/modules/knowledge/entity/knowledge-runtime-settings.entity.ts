import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'
import type { KnowledgeBaseRuntimeConfig, KnowledgeRuntimeConfigScope } from 'share-type'

@Entity('knowledge_runtime_settings')
@Unique(['scope'])
export class KnowledgeRuntimeSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  // 保存配置作用域；当前先支持全局召回配置，后续还能继续扩展系统级作用域。
  @Column({ type: 'varchar', length: 32 })
  scope!: KnowledgeRuntimeConfigScope

  // 保存该作用域下的运行参数，结构与知识库级 runtimeConfig 保持一致。
  @Column({ type: 'jsonb', nullable: true })
  runtimeConfig!: KnowledgeBaseRuntimeConfig | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
