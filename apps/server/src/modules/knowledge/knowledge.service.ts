import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { DataSource, Repository } from 'typeorm'
import type {
  KnowledgeAskInput,
  KnowledgeAskResult,
  KnowledgeBase,
  KnowledgeBaseStatus,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  UpdateKnowledgeBaseInput,
  UpdateKnowledgeDocumentInput
} from 'share-type'
import { EmbeddingService } from './composables/embedding.service'
import {
  KnowledgeQaService,
  type KnowledgeQaStreamEvent
} from './composables/knowledge-qa.service'
import { KnowledgeVectorStoreService } from './composables/knowledge-vector-store.service'
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto'
import { CreateKnowledgeDocumentDto } from './dto/create-knowledge-document.dto'
import { KnowledgeBaseEntity } from './entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from './entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from './entity/knowledge-document.entity'

type KnowledgeAskStream = {
  sources: KnowledgeSearchHit[]
  model: string | null
  totalTokens: Promise<number | null>
  stream: AsyncGenerator<KnowledgeQaStreamEvent>
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly knowledgeDocumentRepo: Repository<KnowledgeDocumentEntity>,
    @InjectRepository(KnowledgeChunkEntity)
    private readonly knowledgeChunkRepo: Repository<KnowledgeChunkEntity>,
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeQaService: KnowledgeQaService,
    private readonly dataSource: DataSource
  ) {}

  // 最小搜索：按 knowledgeBaseId 限定范围，在该知识库下搜索 chunk 内容
  async searchKnowledge(dto: KnowledgeSearchInput): Promise<KnowledgeSearchHit[]> {
    const query = dto.query.trim()
    if (!query) {
      throw new BadRequestException('query cannot be empty')
    }

    // 确保知识库存在
    await this.ensureKnowledgeBaseExists(dto.knowledgeBaseId)
    // 检索知识库
    return this.retrieveKnowledge(dto.knowledgeBaseId, query, 20)
  }

  // 知识库问答

  async askKnowledge(dto: KnowledgeAskInput): Promise<KnowledgeAskResult> {
    const query = dto.query.trim()
    if (!query) {
      throw new BadRequestException('query cannot be empty')
    }

    // 确保知识库存在
    await this.ensureKnowledgeBaseExists(dto.knowledgeBaseId)

    const topK = normalizeTopK(dto.topK)
    const sources = await this.retrieveKnowledge(dto.knowledgeBaseId, query, topK)
    const qaResult = await this.knowledgeQaService.answerQuestion(query, sources, {
      includeReasoning: dto.think
    })

    return {
      answer: qaResult.answer,
      sources,
      model: this.knowledgeQaService.getModelName(),
      reasoningSteps: qaResult.reasoningSteps,
      totalTokens: qaResult.totalTokens
    }
  }

  // 查询所有知识库，同时带出文档数量

  async streamAskKnowledge(
    dto: KnowledgeAskInput,
    options: { signal?: AbortSignal } = {}
  ): Promise<KnowledgeAskStream> {
    const query = dto.query.trim()
    if (!query) {
      throw new BadRequestException('query cannot be empty')
    }

    await this.ensureKnowledgeBaseExists(dto.knowledgeBaseId)

    const topK = normalizeTopK(dto.topK)
    const sources = await this.retrieveKnowledge(dto.knowledgeBaseId, query, topK)

    const qaStream = await this.knowledgeQaService.streamAnswerQuestion(query, sources, {
      includeReasoning: dto.think,
      signal: options.signal
    })

    return {
      sources,
      model: this.knowledgeQaService.getModelName(),
      totalTokens: qaStream.totalTokens,
      stream: qaStream.stream
    }
  }

  // 鏌ヨ鎵€鏈夌煡璇嗗簱锛屽悓鏃跺甫鍑烘枃妗ｆ暟閲?  async findKnowledgeBases(): Promise<KnowledgeBase[]> {
  async findKnowledgeBases(): Promise<KnowledgeBase[]> {
    const items = await this.knowledgeBaseRepo.find({
      order: { updatedAt: 'DESC' },
      relations: { documents: true }
    })

    return items.map(toKnowledgeBase)
  }

  // 创建知识库
  async createKnowledgeBase(dto: CreateKnowledgeBaseDto): Promise<KnowledgeBase> {
    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('Knowledge base name cannot be empty')
    }

    const entity = this.knowledgeBaseRepo.create({
      name,
      description: dto.description?.trim() || null
    })

    const created = await this.knowledgeBaseRepo.save(entity)
    return toKnowledgeBase(created, 0)
  }

  // 更新知识库稳定字段
  async updateKnowledgeBase(
    knowledgeBaseId: string,
    dto: UpdateKnowledgeBaseInput
  ): Promise<KnowledgeBase> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }

    if (typeof dto.name === 'string') {
      const name = dto.name.trim()
      if (!name) {
        throw new BadRequestException('Knowledge base name cannot be empty')
      }
      kb.name = name
    }

    if (typeof dto.description === 'string') {
      kb.description = dto.description.trim() || null
    }

    const updated = await this.knowledgeBaseRepo.save(kb)
    return toKnowledgeBase(updated)
  }

  // 查询某个知识库下的文档列表
  async findKnowledgeDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
    const items = await this.knowledgeDocumentRepo.find({
      where: { knowledgeBaseId },
      order: { updatedAt: 'DESC' }
    })

    return items.map(toKnowledgeDocument)
  }

  // 查询单个文档详情
  async findKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    return toKnowledgeDocument(document)
  }

  // 更新文档可编辑配置
  async updateKnowledgeDocument(
    docId: string,
    dto: UpdateKnowledgeDocumentInput
  ): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: docId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    if (typeof dto.name === 'string') {
      const name = dto.name.trim()
      if (!name) {
        throw new BadRequestException('Document name cannot be empty')
      }
      document.name = name
    }

    if (typeof dto.chunkStrategy === 'string') {
      const chunkStrategy = dto.chunkStrategy.trim()
      if (!chunkStrategy) {
        throw new BadRequestException('chunkStrategy cannot be empty')
      }
      document.chunkStrategy = chunkStrategy
    }

    if (dto.chunkConfig) {
      document.chunkConfig = dto.chunkConfig
    }

    await this.knowledgeDocumentRepo.save(document)
    return toKnowledgeDocument(document)
  }

  // 创建文档记录，当前只支持本地 txt / md 文件
  async createKnowledgeDocument(
    knowledgeBaseId: string,
    dto: CreateKnowledgeDocumentDto
  ): Promise<KnowledgeDocument> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }

    const name = dto.name.trim()
    if (!name) {
      throw new BadRequestException('Document name cannot be empty')
    }

    const storagePath = dto.storagePath.trim()
    if (!storagePath) {
      throw new BadRequestException('storagePath cannot be empty')
    }

    ensureSupportedLocalTextFile(storagePath)

    const fileStats = await this.readLocalFileStats(storagePath)
    const fileType = inferFileTypeFromPath(storagePath)

    const entity = this.knowledgeDocumentRepo.create({
      knowledgeBaseId,
      name,
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
    return toKnowledgeDocument(created)
  }

  // 查询某个文档下的 chunk 列表
  async findDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    const items = await this.knowledgeChunkRepo.find({
      where: { documentId },
      order: { sequence: 'ASC' }
    })

    return items.map(toKnowledgeChunk)
  }

  // 根据文档当前配置重建 chunk
  async rebuildDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
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
      const parts = await splitText(rawContent, chunkSize, overlap)
      const embeddings = await this.embeddingService.embedChunks(parts)

      await this.dataSource.transaction(async (manager) => {
        // 每次重建前先清空旧 chunk，再写入新 chunk
        await manager.delete(KnowledgeChunkEntity, { documentId })

        const chunkEntities = parts.map((content, index) =>
          manager.create(KnowledgeChunkEntity, {
            documentId,
            content,
            sequence: index,
            charCount: content.length,
            tokenCount: estimateTokenCount(content),
            metadata: buildChunkMetadata(document),
            embedding: embeddings[index]?.length ? embeddings[index] : null
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

      return items.map(toKnowledgeChunk)
    } catch (error) {
      // 任意一步失败都把文档状态标记为 failed
      await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'failed' })
      throw error
    }
  }

  // 删除知识库，文档和 chunk 依赖外键 onDelete 级联删除
  async deleteKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBase> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId },
      relations: { documents: true }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }

    await this.knowledgeBaseRepo.delete({ id: knowledgeBaseId })
    return toKnowledgeBase(kb)
  }

  // 删除单个文档，chunk 依赖外键 onDelete 级联删除
  async deleteKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    await this.knowledgeDocumentRepo.delete({ id: documentId })
    return toKnowledgeDocument(document)
  }

  // 统一召回入口
  private async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK = 20
  ): Promise<KnowledgeSearchHit[]> {
    const keywordHits = await this.keywordRecall(knowledgeBaseId, query, topK)
    const vectorHits = await this.vectorRecall(knowledgeBaseId, query, topK)

    return this.mergeHits(keywordHits, vectorHits, topK)
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

  // 全部 chunk 拉出来召回
  private async keywordRecall(
    knowledgeBaseId: string | undefined,
    query: string,
    limit = 20
  ): Promise<KnowledgeSearchHit[]> {
    const keywords = buildSearchKeywords(query)

    const items = await this.knowledgeChunkRepo.find({
      where: knowledgeBaseId
        ? {
            document: {
              knowledgeBaseId
            }
          }
        : {},
      relations: {
        document: true
      },
      order: {
        updatedAt: 'DESC'
      },
      take: 100
    })

    return items
      .map((item) => ({
        chunkId: item.id,
        documentId: item.documentId,
        documentName: item.document?.name ?? '',
        content: item.content,
        score: calcSimpleScore(item.content, keywords)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  // 向量召回
  private async vectorRecall(
    knowledgeBaseId: string | undefined,
    query: string,
    limit = 20
  ): Promise<KnowledgeSearchHit[]> {
    // 返回的是 [文档，分数]
    const results = await this.knowledgeVectorStoreService.similaritySearchWithScore(
      query,
      limit,
      knowledgeBaseId
    )

    return results.map(([doc, score]) => ({
      chunkId: doc.id ?? '',
      documentId: String(doc.metadata.documentId ?? ''),
      documentName: String(doc.metadata.documentName ?? ''),
      content: doc.pageContent,
      score: Number((score * 100).toFixed(2))
    }))
  }

  // 确保知识库存在
  private async ensureKnowledgeBaseExists(knowledgeBaseId?: string): Promise<void> {
    if (!knowledgeBaseId) {
      return
    }

    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId }
    })

    if (!kb) {
      throw new NotFoundException('Knowledge base not found')
    }
  }

  // 关键词 + 向量合并，使用 rrf 合并
  private mergeHits(
    keywordHits: KnowledgeSearchHit[],
    vectorHits: KnowledgeSearchHit[],
    limit = 20
  ): KnowledgeSearchHit[] {
    const rrfK = 60
    // 默认的最高分
    const maxScore = 2 / (rrfK + 1)
    const merged = new Map<string, KnowledgeSearchHit & { rrfScore: number }>()

    // 两路召回所得到的分数
    const addRankScores = (items: KnowledgeSearchHit[]) => {
      items.forEach((item, index) => {
        // 关键词序列排名第几
        const rank = index + 1
        const rankScore = 1 / (rrfK + rank)

        const current = merged.get(item.chunkId)
        if (!current) {
          merged.set(item.chunkId, {
            ...item,
            rrfScore: rankScore
          })
          return
        }

        current.rrfScore += rankScore
      })
    }

    addRankScores(keywordHits)
    addRankScores(vectorHits)

    // 对 rrfScore 排序，同时保留 2 位小数
    return Array.from(merged.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(({ rrfScore, ...item }) => ({
        ...item,
        score: Number(((rrfScore / maxScore) * 100).toFixed(2))
      }))
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
async function splitText(content: string, chunkSize = 500, overlap = 100): Promise<string[]> {
  const text = content.trim()
  if (!text) return []

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: overlap
  })

  const parts = await splitter.splitText(text)
  return parts.map((item) => item.trim()).filter(Boolean)
}

// 简单估算 token 数，当前先按字符数近似
function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

// 搜索词按空格、换行和常见中文标点拆成关键词
function buildSearchKeywords(query: string): string[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const keywords = normalizedQuery
    .split(/[\s,，。；;、]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const compact = removeSearchWhitespace(normalizedQuery)
  const candidates = [normalizedQuery, ...keywords]

  if (compact && compact !== normalizedQuery) {
    candidates.push(compact)
  }

  return Array.from(new Set(candidates))
}

function countKeywordMatches(content: string, keyword: string): number {
  const normalizedContent = content.toLowerCase()
  const normalizedKeyword = keyword.toLowerCase()
  if (!normalizedKeyword) return 0

  const compactContent = removeSearchWhitespace(normalizedContent)
  const compactKeyword = removeSearchWhitespace(normalizedKeyword)
  const matchCount = normalizedContent.split(normalizedKeyword).length - 1
  const compactMatchCount = compactContent.split(compactKeyword).length - 1

  return matchCount > 0 ? matchCount : compactMatchCount
}

// 最小可解释分数：命中关键词越多、命中次数越多，分数越高
function calcSimpleScore(content: string, keywords: string[]): number {
  if (!keywords.length) return 0

  let matchedKeywordCount = 0
  let totalMatchCount = 0
  let matchedKeywordLength = 0

  for (const keyword of keywords) {
    const matchCount = countKeywordMatches(content, keyword)
    if (matchCount <= 0) continue

    matchedKeywordCount += 1
    totalMatchCount += matchCount
    matchedKeywordLength += keyword.length
  }

  if (matchedKeywordCount <= 0) return 0

  const coverageScore = (matchedKeywordCount / keywords.length) * 60
  const countScore = Math.min(25, totalMatchCount * 8)
  const densityScore = Math.min(15, (matchedKeywordLength / Math.max(1, content.length)) * 100)

  return Number(Math.min(100, coverageScore + countScore + densityScore).toFixed(2))
}

function removeSearchWhitespace(value: string): string {
  return value.replace(/\s+/g, '')
}

function buildChunkMetadata(document: KnowledgeDocumentEntity): Record<string, unknown> {
  return {
    knowledgeBaseId: document.knowledgeBaseId,
    documentId: document.id,
    documentName: document.name
  }
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

// 校验 topK 参数，确保在 1-8 范围内
function normalizeTopK(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 5
  }

  return Math.min(Math.max(Math.floor(value), 1), 8)
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
    charCount: entity.charCount,
    tokenCount: entity.tokenCount,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}
