import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { UpdateKnowledgeBaseInput } from 'share-type'

export class UpdateKnowledgeBaseDto implements UpdateKnowledgeBaseInput {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  // 这里允许 admin 直接提交对象，具体字段边界统一在服务层做归一化。
  @IsOptional()
  @IsObject()
  runtimeConfig?: UpdateKnowledgeBaseInput['runtimeConfig']
}
