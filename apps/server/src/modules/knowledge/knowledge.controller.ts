import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiResponse } from 'src/common/api-response'
import type { KnowledgeBase, KnowledgeChunk, KnowledgeDocument } from '../../types'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto'
import { KnowledgeService } from './knowledge.service'

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  // 查询所有知识库
  @Get('bases')
  findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    return this.knowledgeService.findKnowledgeBases()
  }

  // 创建知识库
  @Post('bases')
  createKnowledgeBase(@Body() dto: CreateKnowledgeBaseDto): Promise<ApiResponse<KnowledgeBase>> {
    return this.knowledgeService.createKnowledgeBase(dto)
  }

  // 根据知识库 ID 查询文档列表
  @Get('bases/:kbId/documents')
  findKnowledgeDocuments(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeDocument[]>> {
    return this.knowledgeService.findKnowledgeDocuments(kbId)
  }

  // 在指定知识库下创建文档
  @Post('bases/:kbId/documents')
  createKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    return this.knowledgeService.createKnowledgeDocument(kbId, dto)
  }

  // 根据文档 ID 查询 chunk 列表
  @Get('documents/:docId/chunks')
  findDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    return this.knowledgeService.findDocumentChunks(docId)
  }

  // 重新切分文档 chunk
  @Post('documents/:docId/chunks/rebuild')
  rebuildDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    return this.knowledgeService.rebuildDocumentChunks(docId)
  }

  // 删除单个 chunk
  @Delete('chunks/:chunkId')
  deleteKnowledgeChunk(@Param('chunkId') chunkId: string): Promise<ApiResponse<KnowledgeChunk>> {
    return this.knowledgeService.deleteKnowledgeChunk(chunkId)
  }

  // 删除单个文档
  @Delete('documents/:docId')
  deleteKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    return this.knowledgeService.deleteKnowledgeDocument(docId)
  }

  // 删除知识库
  @Delete('bases/:kbId')
  deleteKnowledgeBase(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeBase>> {
    return this.knowledgeService.deleteKnowledgeBase(kbId)
  }

  // 更新文档稳定配置
  @Patch('documents/:docId')
  updateKnowledgeDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    return this.knowledgeService.updateKnowledgeDocument(docId, dto)
  }
}
