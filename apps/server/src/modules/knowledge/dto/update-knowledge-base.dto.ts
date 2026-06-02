import { IsOptional, IsString, MaxLength } from 'class-validator'
import type { UpdateKnowledgeBaseInput } from 'share-type'

export class UpdateKnowledgeBaseDto implements UpdateKnowledgeBaseInput {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  description?: string
}
