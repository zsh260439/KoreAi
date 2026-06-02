import { IsString, MaxLength } from 'class-validator'

export class SearchKnowledgeDto {
  @IsString()
  @MaxLength(200)
  query!: string

  @IsString()
  knowledgeBaseId!: string
}
