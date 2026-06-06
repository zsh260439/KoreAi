import { IsOptional, IsString, MaxLength } from 'class-validator'

export class SearchKnowledgeDto {
  @IsString()
  @MaxLength(200)
  query!: string

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string
}
