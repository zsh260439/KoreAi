import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import type {
  KnowledgeAskResult,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchHit
} from 'share-type'
import { ApiResponse } from '../../common/api-response'
import { AskKnowledgeDto } from './dto/ask-knowledge.dto'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { SearchKnowledgeDto } from './dto/search-knowledge.dto'
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto'
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto'
import { KnowledgeService } from './knowledge.service'

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  // 最小搜索接口：按 query 搜索指定知识库下的 chunks
  @Post('search')
  async searchKnowledge(@Body() dto: SearchKnowledgeDto): Promise<ApiResponse<KnowledgeSearchHit[]>> {
    const data = await this.knowledgeService.searchKnowledge(dto)
    return ApiResponse.success(0, '搜索成功', data)
  }

  // 问答接口：根据 query 搜索指定知识库下的 chunks，返回最相关的 chunk 内容
  @Post('ask')
  async askKnowledge(@Body() dto: AskKnowledgeDto): Promise<ApiResponse<KnowledgeAskResult>> {
    const data = await this.knowledgeService.askKnowledge(dto)
    return ApiResponse.success(0, '问答成功', data)
  }

  // 查询所有知识库
  @Get('bases')
  async findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    const data = await this.knowledgeService.findKnowledgeBases()
    return ApiResponse.success(0, '查询成功', data)
  }

  // 创建知识库
  @Post('bases')
  async createKnowledgeBase(
    @Body() dto: CreateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.createKnowledgeBase(dto)
    return ApiResponse.success(0, '创建成功', data)
  }

  // 更新知识库稳定字段
  @Patch('bases/:kbId')
  async updateKnowledgeBase(
    @Param('kbId') kbId: string,
    @Body() dto: UpdateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.updateKnowledgeBase(kbId, dto)
    return ApiResponse.success(0, '更新成功', data)
  }

  // 根据知识库 ID 查询文档列表
  @Get('bases/:kbId/documents')
  async findKnowledgeDocuments(
    @Param('kbId') kbId: string
  ): Promise<ApiResponse<KnowledgeDocument[]>> {
    const data = await this.knowledgeService.findKnowledgeDocuments(kbId)
    return ApiResponse.success(0, '查询成功', data)
  }

  // 查询单个文档详情
  @Get('documents/:docId')
  async findKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.findKnowledgeDocument(docId)
    return ApiResponse.success(0, '查询成功', data)
  }

  // 在指定知识库下创建文档
  @Post('bases/:kbId/documents')
  async createKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.createKnowledgeDocument(kbId, dto)
    return ApiResponse.success(0, '创建成功', data)
  }

  // 查询文档下的 chunk 列表
  @Get('documents/:docId/chunks')
  async findDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.knowledgeService.findDocumentChunks(docId)
    return ApiResponse.success(0, '查询成功', data)
  }

  // 根据当前文档配置重新切分 chunk
  @Post('documents/:docId/chunks/rebuild')
  async rebuildDocumentChunks(
    @Param('docId') docId: string
  ): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.knowledgeService.rebuildDocumentChunks(docId)
    return ApiResponse.success(0, '重新切分成功', data)
  }

  // 删除单个文档
  @Delete('documents/:docId')
  async deleteKnowledgeDocument(
    @Param('docId') docId: string
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.deleteKnowledgeDocument(docId)
    return ApiResponse.success(0, '删除成功', data)
  }

  // 删除知识库
  @Delete('bases/:kbId')
  async deleteKnowledgeBase(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.deleteKnowledgeBase(kbId)
    return ApiResponse.success(0, '删除成功', data)
  }

  // 更新文档稳定配置
  @Patch('documents/:docId')
  async updateKnowledgeDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.updateKnowledgeDocument(docId, dto)
    return ApiResponse.success(0, '更新成功', data)
  }
}
