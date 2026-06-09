import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { DataSource, Repository } from 'typeorm'
import type {
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

//声明知识问答流式输入结构
type KnowledgeAskStreamInput = {
  query: string
  knowledgeBaseId?: string
  topK?: number
  think?: boolean
}

//声明知识问答流式返回结构
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

  //声明知识库最小搜索能力
  async searchKnowledge(dto: KnowledgeSearchInput): Promise<KnowledgeSearchHit[]> {
    const query = dto.query.trim()
    if (!query) {
      throw new BadRequestException('query cannot be empty')
    }

    //声明搜索前先校验知识库是否存在
    await this.ensureKnowledgeBaseExists(dto.knowledgeBaseId)
    //声明搜索接口固定返回较宽的召回结果用于预览调试
    return this.retrieveKnowledge(dto.knowledgeBaseId, query, 20)
  }

  //声明流式知识问答入口
  async streamAskKnowledge(
    dto: KnowledgeAskStreamInput,
    options: { signal?: AbortSignal } = {}
  ): Promise<KnowledgeAskStream> {
    const query = dto.query.trim()
    if (!query) {
      throw new BadRequestException('query cannot be empty')
    }

    //声明问答前先校验知识库是否存在
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

  //声明知识库列表查询
  async findKnowledgeBases(): Promise<KnowledgeBase[]> {
    const items = await this.knowledgeBaseRepo.find({
      order: { updatedAt: 'DESC' },
      relations: { documents: true }
    })

    return items.map(toKnowledgeBase)
  }

  //声明知识库创建
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

  //声明知识库更新
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

  //声明知识库文档列表查询
  async findKnowledgeDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
    const items = await this.knowledgeDocumentRepo.find({
      where: { knowledgeBaseId },
      order: { updatedAt: 'DESC' }
    })

    return items.map(toKnowledgeDocument)
  }

  //声明单文档详情查询
  async findKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    return toKnowledgeDocument(document)
  }

  //声明文档可编辑配置更新
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

  //声明知识库文档创建
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

    //声明当前阶段只允许本地文本类文件入库
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

  //声明文档 chunk 列表查询
  async findDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    const items = await this.knowledgeChunkRepo.find({
      where: { documentId },
      order: { sequence: 'ASC' }
    })

    return items.map(toKnowledgeChunk)
  }

  //声明文档 chunk 重建
  async rebuildDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId }
    })

    if (!document) {
      throw new NotFoundException('Document not found')
    }

    //声明重建开始前先切换处理中状态
    await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'processing' })

    try {
      //声明始终从 storagePath 读取真实文本而不是信任前端正文
      const rawContent = await this.loadDocumentContent(document)
      const config = (document.chunkConfig ?? {}) as Record<string, unknown>
      const chunkSize = Number(config.chunkSize ?? 500)
      const overlap = Number(config.overlap ?? 100)
      const parts = await splitText(rawContent, chunkSize, overlap)
      const embeddings = await this.embeddingService.embedChunks(parts)

      await this.dataSource.transaction(async (manager) => {
        //声明重建前先清空旧 chunk 再写入新 chunk
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
      //声明任何重建异常都要把文档状态改成失败
      await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'failed' })
      throw error
    }
  }

  //声明知识库删除
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

  //声明单文档删除
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

  //声明统一知识召回入口
  private async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK = 20
  ): Promise<KnowledgeSearchHit[]> {
    const keywordHits = await this.keywordRecall(knowledgeBaseId, query, topK)
    const vectorHits = await this.vectorRecall(knowledgeBaseId, query, topK)
    return this.mergeHits(keywordHits, vectorHits, topK)
  }

  //声明从 storagePath 读取真实文档正文
  private async loadDocumentContent(document: KnowledgeDocumentEntity): Promise<string> {
    if (!document.storagePath) {
      throw new BadRequestException('Document storagePath is empty')
    }

    //声明当前阶段仅支持本地 txt 和 md 文件
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

  //声明读取本地文件基础信息
  private async readLocalFileStats(storagePath: string) {
    try {
      return await stat(storagePath)
    } catch {
      throw new NotFoundException(`File not found: ${storagePath}`)
    }
  }

  //声明关键词召回链路
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

  //声明向量召回链路
  private async vectorRecall(
    knowledgeBaseId: string | undefined,
    query: string,
    limit = 20
  ): Promise<KnowledgeSearchHit[]> {
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

  //声明知识库存在性校验
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

  //声明关键词与向量召回合并逻辑
  private mergeHits(
    keywordHits: KnowledgeSearchHit[],
    vectorHits: KnowledgeSearchHit[],
    limit = 20
  ): KnowledgeSearchHit[] {
    const rrfK = 60
    const maxScore = 2 / (rrfK + 1)
    const merged = new Map<string, KnowledgeSearchHit & { rrfScore: number }>()

    //声明把每一路召回结果都按名次换算成 rrf 分数
    const addRankScores = (items: KnowledgeSearchHit[]) => {
      items.forEach((item, index) => {
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

    return Array.from(merged.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(({ rrfScore, ...item }) => ({
        ...item,
        score: Number(((rrfScore / maxScore) * 100).toFixed(2))
      }))
  }
}

//声明本地文本文件类型校验
function ensureSupportedLocalTextFile(storagePath: string): void {
  const extension = extname(storagePath).toLowerCase()

  if (!['.txt', '.md'].includes(extension)) {
    throw new BadRequestException('Only .txt and .md files are supported in this step')
  }
}

//声明文件类型推断逻辑
function inferFileTypeFromPath(value: string): string {
  const extension = extname(value).toLowerCase()
  return extension ? extension.slice(1) : 'txt'
}

//声明固定尺寸文本切分逻辑
async function splitText(content: string, chunkSize = 500, overlap = 100): Promise<string[]> {
  const text = content.trim()
  if (!text) {
    return []
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: overlap
  })

  const parts = await splitter.splitText(text)
  return parts.map((item) => item.trim()).filter(Boolean)
}

//声明近似 token 估算逻辑
function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

//声明搜索关键词拆分逻辑
function buildSearchKeywords(query: string): string[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return []
  }

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

//声明关键词命中次数统计
function countKeywordMatches(content: string, keyword: string): number {
  const normalizedContent = content.toLowerCase()
  const normalizedKeyword = keyword.toLowerCase()
  if (!normalizedKeyword) {
    return 0
  }

  const compactContent = removeSearchWhitespace(normalizedContent)
  const compactKeyword = removeSearchWhitespace(normalizedKeyword)
  const matchCount = normalizedContent.split(normalizedKeyword).length - 1
  const compactMatchCount = compactContent.split(compactKeyword).length - 1
  return matchCount > 0 ? matchCount : compactMatchCount
}

//声明最小可解释关键词分数
function calcSimpleScore(content: string, keywords: string[]): number {
  if (!keywords.length) {
    return 0
  }

  let matchedKeywordCount = 0
  let totalMatchCount = 0
  let matchedKeywordLength = 0

  for (const keyword of keywords) {
    const matchCount = countKeywordMatches(content, keyword)
    if (matchCount <= 0) {
      continue
    }

    matchedKeywordCount += 1
    totalMatchCount += matchCount
    matchedKeywordLength += keyword.length
  }

  if (matchedKeywordCount <= 0) {
    return 0
  }

  const coverageScore = (matchedKeywordCount / keywords.length) * 60
  const countScore = Math.min(25, totalMatchCount * 8)
  const densityScore = Math.min(15, (matchedKeywordLength / Math.max(1, content.length)) * 100)
  return Number(Math.min(100, coverageScore + countScore + densityScore).toFixed(2))
}

//声明搜索空白压缩逻辑
function removeSearchWhitespace(value: string): string {
  return value.replace(/\s+/g, '')
}

//声明 chunk 元数据构建逻辑
function buildChunkMetadata(document: KnowledgeDocumentEntity): Record<string, unknown> {
  return {
    knowledgeBaseId: document.knowledgeBaseId,
    documentId: document.id,
    documentName: document.name
  }
}

//声明知识库实体映射逻辑
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

//声明 topK 规范化逻辑
function normalizeTopK(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 5
  }

  return Math.min(Math.max(Math.floor(value), 1), 8)
}

//声明文档实体映射逻辑
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

//声明 chunk 实体映射逻辑
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
