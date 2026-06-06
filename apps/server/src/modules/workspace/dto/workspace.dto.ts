import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class WorkspaceChatDto {
  @IsString()
  @MaxLength(200)
  query!: string

  @IsOptional()
  @IsString()
  knowledgeBaseId?: string

  @IsOptional()
  @IsBoolean()
  think?: boolean
}
