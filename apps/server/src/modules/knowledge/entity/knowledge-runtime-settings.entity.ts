import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { KnowledgeBaseRuntimeConfig, KnowledgeProviderRuntimeConfig } from 'share-type'

@Entity('knowledge_runtime_settings')
export class KnowledgeRuntimeSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 32, unique: true })
  scope!: string

  // 鍏ㄥ簱鎼滅储鐨勯粯璁ゅ弬鏁板崟鐙寔涔呭寲锛岄伩鍏嶇户缁彧鑳藉洖閫€浠ｇ爜甯搁噺銆?  @Column({ type: 'jsonb', nullable: true })
  runtimeConfig!: KnowledgeBaseRuntimeConfig | null

  // 瀵嗛挜涓嶅叆搴擄紝鍙繚瀛樻ā鍨嬨€佸湴鍧€鍜?OCR 寮€鍏宠繖绫诲彲鍏紑鐨勮繍琛岃鐩栭」銆?  @Column({ type: 'jsonb', nullable: true })
  providerConfig!: KnowledgeProviderRuntimeConfig | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

