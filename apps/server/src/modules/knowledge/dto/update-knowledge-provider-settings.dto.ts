import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import type { KnowledgeProviderRuntimeConfigPatch } from 'share-type'

export class UpdateKnowledgeProviderSettingsDto implements KnowledgeProviderRuntimeConfigPatch {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  llmBaseUrl?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  llmModel?: string | null

  @IsOptional()
  @IsBoolean()
  ocrEnabled?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ocrBaseUrl?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(160)
  ocrModel?: string | null

  @IsOptional()
  @IsBoolean()
  autoSyncDocuments?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  documentSyncIntervalHours?: number
}
