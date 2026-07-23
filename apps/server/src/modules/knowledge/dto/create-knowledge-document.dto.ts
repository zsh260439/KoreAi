import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { CreateKnowledgeDocumentInput, StructureAwareChunkConfig } from 'share-type'

export class CreateKnowledgeDocumentDto implements CreateKnowledgeDocumentInput {
  @IsString()
  @MaxLength(255)
  name!: string

  @IsString()
  storagePath!: string

  @IsOptional()
  @IsObject()
  chunkConfig?: StructureAwareChunkConfig
}

