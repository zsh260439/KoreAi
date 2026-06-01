import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { CreateKnowledgeDocumentInput } from 'share-type'

export class CreateKnowledgeDocumentDto implements CreateKnowledgeDocumentInput {
  @IsString()
  @MaxLength(255)
  name!: string

  @IsString()
  storagePath!: string

  @IsOptional()
  @IsString()
  chunkStrategy?: string

  @IsOptional()
  @IsObject()
  chunkConfig?: Record<string, unknown>
}
