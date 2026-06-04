import {IsInt,IsString,Max,MaxLength,Min,IsOptional} from 'class-validator'
import type {KnowledgeAskInput} from 'share-type/knowledge'

export class AskKnowledgeDto implements KnowledgeAskInput {
  @IsString()
  @MaxLength(200)
  query!: string

  @IsString()
  knowledgeBaseId!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  topK?: number
}
