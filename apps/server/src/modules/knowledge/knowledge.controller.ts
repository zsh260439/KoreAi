import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import type {
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchHit
} from 'share-type'
import { ApiResponse } from '../../common/api-response'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { SearchKnowledgeDto } from './dto/search-knowledge.dto'
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto'
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto'
import { KnowledgeService } from './knowledge.service'

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  //声明知识库最小搜索接口
  @Post('search')
  async searchKnowledge(@Body() dto: SearchKnowledgeDto): Promise<ApiResponse<KnowledgeSearchHit[]>> {
    const data = await this.knowledgeService.searchKnowledge(dto)
    return ApiResponse.success(0, '搜索成功', data)
  }

  //声明知识库列表查询接口
  @Get('bases')
  async findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    const data = await this.knowledgeService.findKnowledgeBases()
    return ApiResponse.success(0, '查询成功', data)
  }

  //声明知识库创建接口
  @Post('bases')
  async createKnowledgeBase(
    @Body() dto: CreateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.createKnowledgeBase(dto)
    return ApiResponse.success(0, '创建成功', data)
  }

  //声明知识库更新接口
  @Patch('bases/:kbId')
  async updateKnowledgeBase(
    @Param('kbId') kbId: string,
    @Body() dto: UpdateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.updateKnowledgeBase(kbId, dto)
    return ApiResponse.success(0, '更新成功', data)
  }

  //声明知识库文档列表查询接口
  @Get('bases/:kbId/documents')
  async findKnowledgeDocuments(
    @Param('kbId') kbId: string
  ): Promise<ApiResponse<KnowledgeDocument[]>> {
    const data = await this.knowledgeService.findKnowledgeDocuments(kbId)
    return ApiResponse.success(0, '查询成功', data)
  }

  //声明知识库单文档详情接口
  @Get('documents/:docId')
  async findKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.findKnowledgeDocument(docId)
    return ApiResponse.success(0, '查询成功', data)
  }

  //声明知识库文档创建接口
  @Post('bases/:kbId/documents')
  async createKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.createKnowledgeDocument(kbId, dto)
    return ApiResponse.success(0, '创建成功', data)
  }

  //声明文档 chunk 列表查询接口
  @Get('documents/:docId/chunks')
  async findDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.knowledgeService.findDocumentChunks(docId)
    return ApiResponse.success(0, '查询成功', data)
  }

  //声明文档 chunk 重建接口
  @Post('documents/:docId/chunks/rebuild')
  async rebuildDocumentChunks(
    @Param('docId') docId: string
  ): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.knowledgeService.rebuildDocumentChunks(docId)
    return ApiResponse.success(0, '重新切分成功', data)
  }

  //声明单文档删除接口
  @Delete('documents/:docId')
  async deleteKnowledgeDocument(
    @Param('docId') docId: string
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.deleteKnowledgeDocument(docId)
    return ApiResponse.success(0, '删除成功', data)
  }

  //声明知识库删除接口
  @Delete('bases/:kbId')
  async deleteKnowledgeBase(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.deleteKnowledgeBase(kbId)
    return ApiResponse.success(0, '删除成功', data)
  }

  //声明文档配置更新接口
  @Patch('documents/:docId')
  async updateKnowledgeDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.updateKnowledgeDocument(docId, dto)
    return ApiResponse.success(0, '更新成功', data)
  }
}
