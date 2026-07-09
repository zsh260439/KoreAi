import { IsObject } from 'class-validator'
import type { UpdateKnowledgeRuntimeConfigInput } from 'share-type'

export class UpdateKnowledgeRuntimeConfigDto implements UpdateKnowledgeRuntimeConfigInput {
  // 这里要求显式传入 runtimeConfig，避免全局配置接口收到空 patch 也被误判为成功。
  @IsObject()
  runtimeConfig!: UpdateKnowledgeRuntimeConfigInput['runtimeConfig']
}
