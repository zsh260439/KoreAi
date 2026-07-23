import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { StructureAwareChunkConfig, UpdateKnowledgeDocumentInput } from 'share-type'

export class UpdateKnowledgeDocumentDto implements UpdateKnowledgeDocumentInput {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsObject()
  chunkConfig?: StructureAwareChunkConfig
}

