import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { createReadStream } from 'node:fs'
import type {
  ApiResponse,
  KnowledgeBase,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentRevision,
  KnowledgeDocumentSyncEvent,
  KnowledgeDocumentTrash,
  KnowledgeGlobalRuntimeSettings,
  KnowledgeProviderSettings,
  KnowledgeSearchResponse
} from 'share-type'

import { successResponse } from '../../common/api-response'
import { KnowledgeConfigService } from './runtime/config/knowledge-config.service'
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
} from './pipeline/document-processing/knowledge-document.service'
import type { UploadedKnowledgeDocumentFile } from './pipeline/document-processing/knowledge-file.service'
import { KnowledgeBaseService } from './runtime/management/knowledge-base.service'
import { KnowledgeQueryService } from './pipeline/query-understanding/knowledge-query.service'

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
    return successResponse(data, '鎼滅储鎴愬姛')
  }

  @Get('bases')
  async findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    const data = await this.baseService.findKnowledgeBases()
    return successResponse(data, '鏌ヨ鎴愬姛')
  }

  @Get('runtime-config/global')
  async findGlobalRuntimeConfig(): Promise<ApiResponse<KnowledgeGlobalRuntimeSettings>> {
    const data = await this.configService.findGlobalRuntimeConfig()
    return successResponse(data, '鏌ヨ鎴愬姛')
  }

  @Patch('runtime-config/global')
  async updateGlobalRuntimeConfig(
    @Body() dto: UpdateKnowledgeGlobalRuntimeConfigDto
  ): Promise<ApiResponse<KnowledgeGlobalRuntimeSettings>> {
    const data = await this.configService.updateGlobalRuntimeConfig(dto)
    return successResponse(data, '鏇存柊鎴愬姛')
  }

  @Get('provider-settings')
  async findProviderSettings(): Promise<ApiResponse<KnowledgeProviderSettings>> {
    const data = await this.configService.findProviderSettings()
    return successResponse(data, '鏌ヨ鎴愬姛')
  }

  @Patch('provider-settings')
  async updateProviderSettings(
    @Body() dto: UpdateKnowledgeProviderSettingsDto
  ): Promise<ApiResponse<KnowledgeProviderSettings>> {
    const data = await this.configService.updateProviderSettings(dto)
    return successResponse(data, '鏇存柊鎴愬姛')
  }

  @Get('document-sync-events')
  findDocumentSyncEvents(): ApiResponse<KnowledgeDocumentSyncEvent[]> {
    return successResponse(this.documentService.findDocumentSyncEvents())
  }

  @Post('bases')
  async createKnowledgeBase(@Body() dto: CreateKnowledgeBaseDto): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.baseService.createKnowledgeBase(dto)
    return successResponse(data, '鍒涘缓鎴愬姛')
  }

  @Patch('bases/:kbId')
  async updateKnowledgeBase(
    @Param('kbId') kbId: string,
    @Body() dto: UpdateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.baseService.updateKnowledgeBase(kbId, dto)
    return successResponse(data, '鏇存柊鎴愬姛')
  }

  @Get('bases/:kbId/documents')
  async findKnowledgeDocuments(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeDocument[]>> {
    const data = await this.documentService.findKnowledgeDocuments(kbId)
    return successResponse(data, '鏌ヨ鎴愬姛')
  }

  @Get('documents/:docId')
  async findKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.findKnowledgeDocument(docId)
    return successResponse(data, '鏌ヨ鎴愬姛')
  }

  @Get('documents/:docId/file')
  async findKnowledgeDocumentFile(@Param('docId') docId: string): Promise<StreamableFile> {
    const file = await this.documentService.findKnowledgeDocumentFile(docId)
    const fileName = file.name.endsWith(`.${file.fileType}`)
      ? file.name
      : `${file.name}.${file.fileType}`

    return new StreamableFile(createReadStream(file.path), {
      type: getDocumentMimeType(file.fileType),
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`
    })
  }

  @Post('bases/:kbId/documents')
  async createKnowledgeDocument(
    @Param('kbId') kbId: string,
    @Body() dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.createKnowledgeDocument(kbId, dto)
    return successResponse(data, '鍒涘缓鎴愬姛')
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
    return successResponse(data, '涓婁紶鎴愬姛')
  }

  @Get('documents/:docId/chunks')
  async findDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const data = await this.documentService.findDocumentChunks(docId)
    return successResponse(data, '鏌ヨ鎴愬姛')
  }

  @Post('documents/:docId/chunks/rebuild')
  async rebuildDocumentChunks(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.rebuildDocumentChunks(docId)
    return successResponse(data, '已加入处理队列')
  }

  @Delete('documents/:docId')
  async deleteKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.deleteKnowledgeDocument(docId)
    return successResponse(data, '鍒犻櫎鎴愬姛')
  }

  @Get('documents/:docId/revisions')
  async findDocumentRevisions(
    @Param('docId') docId: string
  ): Promise<ApiResponse<KnowledgeDocumentRevision[]>> {
    return successResponse(await this.documentService.findDocumentRevisions(docId))
  }

  @Post('documents/:docId/revisions/:revisionId/rollback')
  async rollbackDocumentRevision(
    @Param('docId') docId: string,
    @Param('revisionId') revisionId: string
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.rollbackDocumentRevision(docId, revisionId)
    return successResponse(data, '索引版本已回滚')
  }

  @Get('documents-trash')
  async findDocumentTrash(): Promise<ApiResponse<KnowledgeDocumentTrash>> {
    return successResponse(await this.documentService.findTrash())
  }

  @Post('documents/:docId/restore')
  async restoreKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<KnowledgeDocument>> {
    return successResponse(await this.documentService.restoreKnowledgeDocument(docId), '鎭㈠鎴愬姛')
  }

  @Delete('documents/:docId/purge')
  async purgeKnowledgeDocument(@Param('docId') docId: string): Promise<ApiResponse<null>> {
    await this.documentService.purgeKnowledgeDocument(docId)
    return successResponse(null, '已加入永久删除队列')
  }

  @Delete('bases/:kbId')
  async deleteKnowledgeBase(@Param('kbId') kbId: string): Promise<ApiResponse<KnowledgeBase>> {
    const data = await this.baseService.deleteKnowledgeBase(kbId)
    return successResponse(data, '鍒犻櫎鎴愬姛')
  }

  @Patch('documents/:docId')
  async updateKnowledgeDocument(
    @Param('docId') docId: string,
    @Body() dto: UpdateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const data = await this.documentService.updateKnowledgeDocument(docId, dto)
    return successResponse(data, '鏇存柊鎴愬姛')
  }
}

function getDocumentMimeType(fileType: string): string {
  return {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8'
  }[fileType] ?? 'application/octet-stream'
}

