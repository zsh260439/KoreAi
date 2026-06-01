import { IsString, MaxLength, IsOptional } from 'class-validator'
import type { CreateKnowledgeBaseInput } from 'share-type'

export class CreateKnowledgeBaseDto implements CreateKnowledgeBaseInput {
  @IsString()
  @MaxLength(100)
  name!: string

  @IsOptional()
  @IsString()
  description?: string
}
