import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import type {KnowledgeAskInput} from 'share-type/knowledge'

export class AskKnowledgeDto implements KnowledgeAskInput {
  @IsString()
  @MaxLength(200)
  query!: string

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  topK?: number
}
