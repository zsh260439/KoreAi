import { IsObject, IsOptional } from 'class-validator'
import type { KnowledgeBaseRuntimeConfigPatch } from 'share-type'

export class UpdateKnowledgeGlobalRuntimeConfigDto implements KnowledgeBaseRuntimeConfigPatch {
  @IsOptional()
  @IsObject()
  retrieval?: KnowledgeBaseRuntimeConfigPatch['retrieval']

  @IsOptional()
  @IsObject()
  answer?: KnowledgeBaseRuntimeConfigPatch['answer']
}

