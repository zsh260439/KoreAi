import { IsOptional, IsString, MaxLength } from 'class-validator'
import type { KnowledgeSearchInput } from 'share-type'

export class SearchKnowledgeDto implements KnowledgeSearchInput {
  @IsString()
  @MaxLength(200)
  query!: string

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string
}
