import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type {
  ApiResponse,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeGlobalRuntimeSettings,
  KnowledgeProviderSettings,
  KnowledgeSearchResponse
} from 'share-type'

import { successResponse } from '../../common/api-response'
import { KnowledgeConfigService } from './config/knowledge-config.service'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { SearchKnowledgeDto } from './dto/search-knowledge.dto'
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto'
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto'
import { UpdateKnowledgeGlobalRuntimeConfigDto } from './dto/update-knowledge-global-runtime-config.dto'
import { UpdateKnowledgeProviderSettingsDto } from './dto/update-knowledge-provider-settings.dto'
import {
  KnowledgeDocumentService,
  type KnowledgeDocumentUploadFields
} from './ingestion/knowledge-document.service'
import type { UploadedKnowledgeDocumentFile } from './ingestion/knowledge-file.service'
import { KnowledgeBaseService } from './management/knowledge-base.service'
import { KnowledgeQueryService } from './query/knowledge-query.service'

@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly queryService: KnowledgeQueryService,
    private readonly configService: KnowledgeConfigService,
    private readonly baseService: KnowledgeBaseService,
    private readonly documentService: KnowledgeDocumentService
  ) {}

  @Post('search')
  async searchKnowledge(@Body() dto: SearchKnowledgeDto): Promise<ApiResponse<KnowledgeSearchResponse>> {
    const data = await this.queryService.searchKnowledge(dto)
    return successResponse(data, '搜索成功')
  }

  @Get('bases')
  async findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    const data = await this.baseService.findKnowledgeBases()
    return successResponse(data, '查询成功')
  }

  @Get('runtime-config/global')
  async findGlobalRuntimeConfig(): Promise<ApiResponse<KnowledgeGlobalRuntimeSettings>> {
    const data = await this.configService.findGlobalRuntimeConfig()
    return successResponse(data, '查询成功')
  }

  @Patch('runtime-config/global')
  async updateGlobalRuntimeConfig(
    @Body() dto: UpdateKnowledgeGlobalRuntimeConfigDto
  ): Promise<ApiResponse<KnowledgeGlobalRuntimeSettings>> {
    const data = await this.configService.updateGlobalRuntimeConfig(dto)
    return successResponse(data, '更新成功')
  }

  @Get('provider-settings')
  async findProviderSettings(): Promise<ApiResponse<KnowledgeProviderSettings>> {
    const data = await this.configService.findProviderSettings()
    return successResponse(data, '查询成功')
  }

  @Patch('provider-settings')
  async updateProviderSettings(
    @Body() dto: UpdateKnowledgeProviderSettingsDto
  ): Promise<ApiResponse<KnowledgeProviderSettings>> {
    const data = await this.configService.updateProviderSettings(dto)
    return successResponse(data, '更新成功')
  }

  @Post('bases')
  async createKnowledgeBase(@Body() dto: CreateKnowledgeBaseDto): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.baseService.createKnowledgeBase(dto)
    return successResponse(data, '创建成功')
  }

  @Patch('bases/:kbId')
  async updateKnowledgeBase(
    @Param('kbId') kbId: string,
    @Body() dto: UpdateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.baseService.updateKnowledgeBase(kbId, dto)
    return successResponse(data, '更新成功')
  }

  @Get('bases/:kbId/documents')
  async findKnowledgeDocuments(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeDocument[]>> {
    const data = await this.documentService.findKnowledgeDocuments(kbId)
    return successResponse(data, '查询成功')
  }

  @Get('documents/:docId')
  async findKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.findKnowledgeDocument(docId)
    return successResponse(data, '查询成功')
  }

  @Post('bases/:kbId/documents')
  async createKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.createKnowledgeDocument(kbId, dto)
    return successResponse(data, '创建成功')
  }

  @Post('bases/:kbId/documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 20 * 1024 * 1024
      }
    })
  )
  async uploadKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() body: KnowledgeDocumentUploadFields,
    @UploadedFile() file?: UploadedKnowledgeDocumentFile
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.uploadKnowledgeDocument(kbId, body, file)
    return successResponse(data, '上传成功')
  }

  @Get('documents/:docId/chunks')
  async findDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.documentService.findDocumentChunks(docId)
    return successResponse(data, '查询成功')
  }

  @Post('documents/:docId/chunks/rebuild')
  async rebuildDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.documentService.rebuildDocumentChunks(docId)
    return successResponse(data, '重新切分成功')
  }

  @Delete('documents/:docId')
  async deleteKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.deleteKnowledgeDocument(docId)
    return successResponse(data, '删除成功')
  }

  @Delete('bases/:kbId')
  async deleteKnowledgeBase(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.baseService.deleteKnowledgeBase(kbId)
    return successResponse(data, '删除成功')
  }

  @Patch('documents/:docId')
  async updateKnowledgeDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.updateKnowledgeDocument(docId, dto)
    return successResponse(data, '更新成功')
  }
}
