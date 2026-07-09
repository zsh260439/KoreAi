import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type {
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeGlobalRuntimeSettings,
  KnowledgeSearchResponse
} from 'share-type'

import { ApiResponse } from '../../common/api-response'
import type { UploadedKnowledgeDocumentFile } from './composables/knowledge-file.service'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { SearchKnowledgeDto } from './dto/search-knowledge.dto'
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto'
import { UpdateKnowledgeDocumentDto } from './dto/update-knowledge-document.dto'
import { UpdateKnowledgeRuntimeConfigDto } from './dto/update-knowledge-runtime-config.dto'
import { KnowledgeService } from './knowledge.service'

type UploadKnowledgeDocumentBody = {
  name?: string
  chunkConfig?: string
}

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  // 声明知识库命中测试接口，返回命中列表和本次检索调试信息。
  @Post('search')
  async searchKnowledge(@Body() dto: SearchKnowledgeDto): Promise<ApiResponse<KnowledgeSearchResponse>> {
    const data = await this.knowledgeService.searchKnowledge(dto)
    return ApiResponse.success(0, '搜索成功', data)
  }

  // 声明知识库列表查询接口。
  @Get('bases')
  async findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    const data = await this.knowledgeService.findKnowledgeBases()
    return ApiResponse.success(0, '查询成功', data)
  }

  // 声明全局召回运行配置查询接口，服务于“全部知识库”召回默认参数。
  @Get('runtime-config/global')
  async findGlobalRuntimeSettings(): Promise<ApiResponse<KnowledgeGlobalRuntimeSettings>> {
    const data = await this.knowledgeService.findGlobalRuntimeSettings()
    return ApiResponse.success(0, '查询成功', data)
  }

  // 声明全局召回运行配置更新接口。
  @Patch('runtime-config/global')
  async updateGlobalRuntimeSettings(
    @Body() dto: UpdateKnowledgeRuntimeConfigDto
  ): Promise<ApiResponse<KnowledgeGlobalRuntimeSettings>> {
    const data = await this.knowledgeService.updateGlobalRuntimeSettings(dto.runtimeConfig)
    return ApiResponse.success(0, '更新成功', data)
  }

  // 声明知识库创建接口。
  @Post('bases')
  async createKnowledgeBase(@Body() dto: CreateKnowledgeBaseDto): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.createKnowledgeBase(dto)
    return ApiResponse.success(0, '创建成功', data)
  }

  // 声明知识库更新接口。
  @Patch('bases/:kbId')
  async updateKnowledgeBase(
    @Param('kbId') kbId: string,
    @Body() dto: UpdateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.updateKnowledgeBase(kbId, dto)
    return ApiResponse.success(0, '更新成功', data)
  }

  // 声明知识库文档列表查询接口。
  @Get('bases/:kbId/documents')
  async findKnowledgeDocuments(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeDocument[]>> {
    const data = await this.knowledgeService.findKnowledgeDocuments(kbId)
    return ApiResponse.success(0, '查询成功', data)
  }

  // 声明单个文档详情接口。
  @Get('documents/:docId')
  async findKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.findKnowledgeDocument(docId)
    return ApiResponse.success(0, '查询成功', data)
  }

  // 声明知识库文档创建接口。
  @Post('bases/:kbId/documents')
  async createKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.createKnowledgeDocument(kbId, dto)
    return ApiResponse.success(0, '创建成功', data)
  }

  // 声明知识库文档上传接口。
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
    @Body() body: UploadKnowledgeDocumentBody,
    @UploadedFile() file?: UploadedKnowledgeDocumentFile
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.uploadKnowledgeDocument(kbId, body, file)
    return ApiResponse.success(0, '上传成功', data)
  }

  // 声明文档 chunk 列表查询接口。
  @Get('documents/:docId/chunks')
  async findDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.knowledgeService.findDocumentChunks(docId)
    return ApiResponse.success(0, '查询成功', data)
  }

  // 声明文档 chunk 重建接口。
  @Post('documents/:docId/chunks/rebuild')
  async rebuildDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.knowledgeService.rebuildDocumentChunks(docId)
    return ApiResponse.success(0, '重新切分成功', data)
  }

  // 声明单文档删除接口。
  @Delete('documents/:docId')
  async deleteKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.deleteKnowledgeDocument(docId)
    return ApiResponse.success(0, '删除成功', data)
  }

  // 声明知识库删除接口。
  @Delete('bases/:kbId')
  async deleteKnowledgeBase(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.knowledgeService.deleteKnowledgeBase(kbId)
    return ApiResponse.success(0, '删除成功', data)
  }

  // 声明文档配置更新接口。
  @Patch('documents/:docId')
  async updateKnowledgeDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.knowledgeService.updateKnowledgeDocument(docId, dto)
    return ApiResponse.success(0, '更新成功', data)
  }
}
