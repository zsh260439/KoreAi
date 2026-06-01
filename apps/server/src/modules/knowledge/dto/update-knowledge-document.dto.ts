import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { UpdateKnowledgeDocumentInput } from 'share-type'
export class UpdateKnowledgeDocumentDto implements UpdateKnowledgeDocumentInput {
    @IsString()
    @IsOptional()
    @MaxLength(255)
  name?: string
  @IsOptional()
  @IsString()
  @MaxLength(255)
  chunkStrategy?: string
  @IsOptional()
  @IsObject()
  chunkConfig?: Record<string, unknown>
}