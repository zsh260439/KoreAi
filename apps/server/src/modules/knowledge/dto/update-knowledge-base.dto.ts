import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator'
import type { UpdateKnowledgeBaseInput } from 'share-type'

export class UpdateKnowledgeBaseDto implements UpdateKnowledgeBaseInput {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @IsString()
  description?: string

  // 杩欓噷鍏佽 admin 鐩存帴鎻愪氦瀵硅薄锛屽叿浣撳瓧娈佃竟鐣岀粺涓€鍦ㄦ湇鍔″眰鍋氬綊涓€鍖栥€?  @IsOptional()
  @IsObject()
  runtimeConfig?: UpdateKnowledgeBaseInput['runtimeConfig']
}

