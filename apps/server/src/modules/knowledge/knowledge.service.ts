import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { ApiResponse } from 'src/common/api-response'
import { DataSource, Repository } from 'typeorm'
import type { KnowledgeBaseStatus, UpdateKnowledgeDocumentInput } from 'share-type'
import type { KnowledgeBase, KnowledgeChunk, KnowledgeDocument } from '../../types'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly knowledgeDocumentRepo: Repository<KnowledgeDocumentEntity>,
    @InjectRepository(KnowledgeChunkEntity)
    private readonly knowledgeChunkRepo: Repository<KnowledgeChunkEntity>,
    private readonly dataSource: DataSource
  ) {}

  // 查询所有知识库，同时带出文档数量
  async findKnowledgeBases(): Promise<ApiResponse<KnowledgeBase[]>> {
    const items = await this.knowledgeBaseRepo.find({
      order: { updatedAt: 'DESC' },
      relations: { documents: true }
    })

    return ApiResponse.success(0, '查询成功', items.map(toKnowledgeBase))
  }

  // 创建知识库
  async createKnowledgeBase(dto: CreateKnowledgeBaseDto): Promise<ApiResponse<KnowledgeBase>> {
    const entity = this.knowledgeBaseRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null
    })

    const created = await this.knowledgeBaseRepo.save(entity)
    return ApiResponse.success(0, '创建成功', toKnowledgeBase(created, 0))
  }
  //更新数据库信息
  async updateKnowledgeBase(
    knowledgeBaseId: string,
    dto: CreateKnowledgeBaseDto
  ): Promise<ApiResponse<KnowledgeBase>>
   {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }

    if (dto.name) {
      kb.name = dto.name.trim()
    }

    if (dto.description) {
      kb.description = dto.description?.trim() || null
    }

    await this.knowledgeBaseRepo.save(kb)
    return ApiResponse.success(0, '更新成功', toKnowledgeBase(kb, 0))
  }
 
  // 更新文档可编辑配置
  async updateKnowledgeDocument(
    docId: string,
    dto: UpdateKnowledgeDocumentInput
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: docId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    if (dto.name) {
      document.name = dto.name.trim()
    }

    if (dto.chunkStrategy) {
      document.chunkStrategy = dto.chunkStrategy.trim()
    }

    if (dto.chunkConfig) {
      document.chunkConfig = dto.chunkConfig
    }

    await this.knowledgeDocumentRepo.save(document)
    return ApiResponse.success(0, '更新成功', toKnowledgeDocument(document))
  }
  // 查询某个知识库下的文档列表
  async findKnowledgeDocuments(knowledgeBaseId: string): Promise<ApiResponse<KnowledgeDocument[]>> {
    const items = await this.knowledgeDocumentRepo.find({
      where: { knowledgeBaseId },
      order: { updatedAt: 'DESC' }
    })

    return ApiResponse.success(0, '查询成功', items.map(toKnowledgeDocument))
  }

  // 创建文档记录，当前只支持本地 txt / md 文件
  async createKnowledgeDocument(
    knowledgeBaseId: string,
    dto: CreateKnowledgeDocumentDto
  ): Promise<ApiResponse<KnowledgeDocument>> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }

    const storagePath = dto.storagePath.trim()
    ensureSupportedLocalTextFile(storagePath)

    const fileStats = await this.readLocalFileStats(storagePath)
    const fileType = inferFileTypeFromPath(storagePath)

    const entity = this.knowledgeDocumentRepo.create({
      knowledgeBaseId,
      name: dto.name.trim(),
      sourceType: 'file',
      storagePath,
      fileType,
      fileSizeBytes: String(fileStats.size),
      chunkStrategy: dto.chunkStrategy?.trim() || 'fixed_size',
      chunkConfig: dto.chunkConfig ?? { chunkSize: 500, overlap: 100 },
      enabled: true,
      status: 'pending'
    })

    const created = await this.knowledgeDocumentRepo.save(entity)
    return ApiResponse.success(0, '创建成功', toKnowledgeDocument(created))
  }

  // 查询某个文档下的 chunk 列表
  async findDocumentChunks(documentId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const items = await this.knowledgeChunkRepo.find({
      where: { documentId },
      order: { sequence: 'ASC' }
    })

    return ApiResponse.success(0, '查询成功', items.map(toKnowledgeChunk))
  }
  //新增chunk信息
  
  // 根据文档当前配置重建 chunk
  async rebuildDocumentChunks(documentId: string): Promise<ApiResponse<KnowledgeChunk[]>> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    // 先把文档状态切到 processing，便于前端感知任务中状态
    await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'processing' })

    try {
      // 从 storagePath 读取真实文件内容，而不是相信前端传正文
      const rawContent = await this.loadDocumentContent(document)
      const config = (document.chunkConfig ?? {}) as Record<string, unknown>
      const chunkSize = Number(config.chunkSize ?? 500)
      const overlap = Number(config.overlap ?? 100)
      const parts = splitText(rawContent, chunkSize, overlap)

      await this.dataSource.transaction(async (manager) => {
        // 每次重建前先清空旧 chunk，再写入新 chunk
        await manager.delete(KnowledgeChunkEntity, { documentId })

        const chunkEntities = parts.map((content, index) =>
          manager.create(KnowledgeChunkEntity, {
            documentId,
            content,
            sequence: index,
            enabled: true,
            charCount: content.length,
            tokenCount: estimateTokenCount(content)
          })
        )

        if (chunkEntities.length > 0) {
          await manager.save(chunkEntities)
        }

        await manager.update(
          KnowledgeDocumentEntity,
          { id: documentId },
          {
            status: 'indexed',
            chunkCount: chunkEntities.length,
            contentPreview: rawContent.slice(0, 500)
          }
        )
      })

      const items = await this.knowledgeChunkRepo.find({
        where: { documentId },
        order: { sequence: 'ASC' }
      })

      return ApiResponse.success(0, '重新切分成功', items.map(toKnowledgeChunk))
    } catch (error) {
      // 任意一步失败都把文档状态标记为 failed
      await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'failed' })
      throw error
    }
  }

  // 删除知识库，文档和 chunk 依赖外键 onDelete 级联删除
  async deleteKnowledgeBase(knowledgeBaseId: string): Promise<ApiResponse<KnowledgeBase>> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }

    await this.knowledgeBaseRepo.delete({ id: knowledgeBaseId })
    return ApiResponse.success(0, '删除成功', toKnowledgeBase(kb))
  }

  // 删除单个文档，chunk 依赖外键 onDelete 级联删除
  async deleteKnowledgeDocument(documentId: string): Promise<ApiResponse<KnowledgeDocument>> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    await this.knowledgeDocumentRepo.delete({ id: documentId })
    return ApiResponse.success(0, '删除成功', toKnowledgeDocument(document))
  }

  // 删除单个 chunk，并同步回写文档 chunkCount
  async deleteKnowledgeChunk(chunkId: string): Promise<ApiResponse<KnowledgeChunk>> {
    const chunk = await this.knowledgeChunkRepo.findOne({
      where: { id: chunkId },
      relations: { document: true }
    })

    if (!chunk) {
      throw new NotFoundException('Chunk not found')
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(KnowledgeChunkEntity, { id: chunkId })

      // chunkCount 是展示字段，删 chunk 后要同步减一
      await manager.update(
        KnowledgeDocumentEntity,
        { id: chunk.documentId },
        { chunkCount: Math.max(0, (chunk.document?.chunkCount ?? 1) - 1) }
      )
    })

    return ApiResponse.success(0, '删除成功', toKnowledgeChunk(chunk))
  }

  // 从 storagePath 读取文档正文
  private async loadDocumentContent(document: KnowledgeDocumentEntity): Promise<string> {
    if (!document.storagePath) {
      throw new BadRequestException('Document storagePath is empty')
    }

    // 当前学习阶段只支持本地 txt / md
    ensureSupportedLocalTextFile(document.storagePath)

    try {
      const content = await readFile(document.storagePath, 'utf-8')
      const normalized = content.trim()

      if (!normalized) {
        throw new BadRequestException('Document content is empty')
      }

      return normalized
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }

      throw new NotFoundException(`Cannot read file: ${document.storagePath}`)
    }
  }

  // 读取本地文件基础信息，例如文件大小
  private async readLocalFileStats(storagePath: string) {
    try {
      return await stat(storagePath)
    } catch {
      throw new NotFoundException(`File not found: ${storagePath}`)
    }
  }
}

// 校验当前阶段支持的本地文本文件类型
function ensureSupportedLocalTextFile(storagePath: string): void {
  const extension = extname(storagePath).toLowerCase()

  if (!['.txt', '.md'].includes(extension)) {
    throw new BadRequestException('Only .txt and .md files are supported in this step')
  }
}

// 从路径后缀推断文件类型
function inferFileTypeFromPath(value: string): string {
  const extension = extname(value).toLowerCase()
  return extension ? extension.slice(1) : 'txt'
}

// 按固定大小 + overlap 规则切分文本
function splitText(content: string, chunkSize = 500, overlap = 100): string[] {
  const text = content.trim()
  if (!text) return []

  const result: string[] = []
  const step = Math.max(1, chunkSize - overlap)

  for (let start = 0; start < text.length; start += step) {
    const chunk = text.slice(start, start + chunkSize).trim()
    if (chunk) result.push(chunk)
    if (start + chunkSize >= text.length) break
  }

  return result
}

// 简单估算 token 数，当前先按字符数近似
function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

// 实体转知识库响应结构
function toKnowledgeBase(
  entity: KnowledgeBaseEntity,
  documentCount = entity.documents?.length ?? 0
): KnowledgeBase {
  const normalizedStatus: KnowledgeBaseStatus = entity.status === 'active' ? 'active' : 'draft'

  return {
    id: entity.id,
    name: entity.name,
    description: entity.description ?? '',
    status: normalizedStatus,
    documentCount,
    embeddingModel: entity.embeddingModel ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}

// 实体转文档响应结构
function toKnowledgeDocument(entity: KnowledgeDocumentEntity): KnowledgeDocument {
  return {
    id: entity.id,
    knowledgeBaseId: entity.knowledgeBaseId,
    name: entity.name,
    sourceType: entity.sourceType,
    sourceLocation: entity.sourceLocation ?? null,
    storagePath: entity.storagePath ?? null,
    fileType: entity.fileType ?? null,
    fileSizeBytes: entity.fileSizeBytes ? Number(entity.fileSizeBytes) : null,
    status: entity.status,
    enabled: entity.enabled,
    chunkStrategy: entity.chunkStrategy ?? null,
    chunkConfig: entity.chunkConfig ?? null,
    chunkCount: entity.chunkCount,
    summary: entity.summary ?? null,
    contentPreview: entity.contentPreview ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}

// 实体转 chunk 响应结构
function toKnowledgeChunk(entity: KnowledgeChunkEntity): KnowledgeChunk {
  return {
    id: entity.id,
    documentId: entity.documentId,
    sequence: entity.sequence,
    content: entity.content,
    enabled: entity.enabled,
    charCount: entity.charCount,
    tokenCount: entity.tokenCount,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}
