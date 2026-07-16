import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { stat } from 'node:fs/promises'
import { DataSource, Repository } from 'typeorm'
import { DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG } from 'share-type'
import type {
  KnowledgeChunk,
  KnowledgeChunkMetadata,
  KnowledgeDocument,
  StructureAwareChunkConfig,
  UpdateKnowledgeDocumentInput
} from 'share-type'
import { CreateKnowledgeDocumentDto } from '../dto/create-knowledge-document.dto'
import { KnowledgeBaseEntity } from '../entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from '../entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from '../entity/knowledge-document.entity'
import { EmbeddingService } from '../retrieval/embedding.service'
import { buildChunksFromBlocks } from './knowledge-chunk-builder'
import {
  parseKnowledgeDocument,
  type ParsedDocument,
  type StructuredBlock
} from './knowledge-document.parser'
import {
  getKnowledgeDocumentBaseName,
  inferKnowledgeDocumentFileType,
  KnowledgeFileService,
  type UploadedKnowledgeDocumentFile
} from './knowledge-file.service'
import { KnowledgeOcrService } from './knowledge-ocr.service'
import { KnowledgePdfParserService } from './knowledge-pdf-parser.service'
import { buildKnowledgeChunkSearchableFields } from './knowledge-searchable-fields'

export type KnowledgeDocumentUploadFields = {
  name?: string
  chunkConfig?: string
}

@Injectable()
export class KnowledgeDocumentService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly documentRepo: Repository<KnowledgeDocumentEntity>,
    @InjectRepository(KnowledgeChunkEntity)
    private readonly chunkRepo: Repository<KnowledgeChunkEntity>,
    private readonly embeddingService: EmbeddingService,
    private readonly fileService: KnowledgeFileService,
    private readonly ocrService: KnowledgeOcrService,
    private readonly pdfParserService: KnowledgePdfParserService,
    private readonly dataSource: DataSource
  ) {}

  async findKnowledgeDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
    const items = await this.documentRepo.find({
      where: { knowledgeBaseId },
      order: { updatedAt: 'DESC' }
    })
    return items.map(toKnowledgeDocument)
  }

  async findKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    return toKnowledgeDocument(await this.findEntity(documentId))
  }

  async updateKnowledgeDocument(
    documentId: string,
    dto: UpdateKnowledgeDocumentInput
  ): Promise<KnowledgeDocument> {
    const document = await this.findEntity(documentId)

    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) {
        throw new BadRequestException('Document name cannot be empty')
      }
      document.name = name
    }
    if (dto.chunkConfig) {
      document.chunkConfig = normalizeChunkConfig(dto.chunkConfig)
    }

    return toKnowledgeDocument(await this.documentRepo.save(document))
  }

  async createKnowledgeDocument(
    knowledgeBaseId: string,
    dto: CreateKnowledgeDocumentDto
  ): Promise<KnowledgeDocument> {
    await this.assertKnowledgeBaseExists(knowledgeBaseId)

    const name = dto.name.trim()
    const storagePath = dto.storagePath.trim()
    if (!name) {
      throw new BadRequestException('Document name cannot be empty')
    }
    if (!storagePath) {
      throw new BadRequestException('storagePath cannot be empty')
    }

    const fileStats = await this.readFileStats(storagePath)
    const created = await this.documentRepo.save(
      this.documentRepo.create({
        knowledgeBaseId,
        name,
        sourceType: 'file',
        storagePath,
        fileType: inferKnowledgeDocumentFileType(storagePath),
        fileSizeBytes: String(fileStats.size),
        chunkConfig: normalizeChunkConfig(dto.chunkConfig),
        status: 'pending'
      })
    )

    return toKnowledgeDocument(created)
  }

  async uploadKnowledgeDocument(
    knowledgeBaseId: string,
    input: KnowledgeDocumentUploadFields,
    file?: UploadedKnowledgeDocumentFile
  ): Promise<KnowledgeDocument> {
    if (!file) {
      throw new BadRequestException('file is required')
    }

    this.fileService.validateFile(file)
    const storagePath = await this.fileService.saveFile(knowledgeBaseId, file)

    try {
      return await this.createKnowledgeDocument(knowledgeBaseId, {
        name: input.name?.trim() || getKnowledgeDocumentBaseName(file.originalname) || '新文档',
        storagePath,
        chunkConfig: parseChunkConfig(input.chunkConfig)
      })
    } catch (error) {
      await this.fileService.deleteFileSafely(storagePath)
      throw error
    }
  }

  async findDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    return this.loadChunks(documentId)
  }

  async rebuildDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    const document = await this.findEntity(documentId)
    await this.documentRepo.update({ id: documentId }, { status: 'processing' })

    try {
      const chunkConfig = normalizeChunkConfig(document.chunkConfig)
      const parsed = await this.parseDocument(document)
      const drafts = buildChunksFromBlocks(parsed.blocks, chunkConfig)
      assertIndexableContent(parsed, drafts.length)
      const embeddings = await this.embeddingService.embedChunks(drafts.map(({ content }) => content))

      // 旧 chunk 删除、新 chunk 写入和文档状态必须一起成功，避免留下半套索引。
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(KnowledgeChunkEntity, { documentId })
        const chunks = drafts.map((draft, sequence) =>
          manager.create(KnowledgeChunkEntity, {
            documentId,
            content: draft.content,
            sequence,
            charCount: draft.content.length,
            tokenCount: estimateTokenCount(draft.content),
            metadata: buildChunkMetadata(document, parsed, draft.blocks),
            embedding: embeddings[sequence]?.length ? embeddings[sequence] : null,
            ...buildKnowledgeChunkSearchableFields(document, parsed, draft.blocks)
          })
        )

        if (chunks.length) {
          await manager.save(chunks)
        }
        await manager.update(
          KnowledgeDocumentEntity,
          { id: documentId },
          {
            status: 'indexed',
            chunkConfig,
            chunkCount: chunks.length,
            contentPreview: parsed.rawContent.slice(0, 500)
          }
        )
      })

      return this.loadChunks(documentId)
    } catch (error) {
      await this.documentRepo.update({ id: documentId }, { status: 'failed' })
      throw error
    }
  }

  async deleteKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.findEntity(documentId)
    await this.documentRepo.delete({ id: documentId })
    return toKnowledgeDocument(document)
  }

  private async parseDocument(document: KnowledgeDocumentEntity): Promise<ParsedDocument> {
    try {
      const parserOptions = this.ocrService.createParserOptions()
      return await parseKnowledgeDocument(
        document.storagePath ?? '',
        {
          ...parserOptions,
          parsePdf: (buffer) => this.pdfParserService.parse(buffer, parserOptions)
        }
      )
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error
      }
      if (document.fileType === 'pdf') {
        throw new UnprocessableEntityException(
          'PDF 文件结构无效或已损坏，无法解析或执行 OCR。'
        )
      }
      throw error
    }
  }

  private async assertKnowledgeBaseExists(knowledgeBaseId: string): Promise<void> {
    if (!(await this.knowledgeBaseRepo.existsBy({ id: knowledgeBaseId }))) {
      throw new NotFoundException('Knowledge base not found')
    }
  }

  private async findEntity(documentId: string): Promise<KnowledgeDocumentEntity> {
    const document = await this.documentRepo.findOne({ where: { id: documentId } })
    if (!document) {
      throw new NotFoundException('Document not found')
    }
    return document
  }

  private async readFileStats(storagePath: string) {
    try {
      return await stat(storagePath)
    } catch {
      throw new NotFoundException(`File not found: ${storagePath}`)
    }
  }

  private async loadChunks(documentId: string): Promise<KnowledgeChunk[]> {
    const items = await this.chunkRepo
      .createQueryBuilder('chunk')
      .addSelect('chunk.metadata')
      .where('chunk.documentId = :documentId', { documentId })
      .orderBy('chunk.sequence', 'ASC')
      .getMany()
    return items.map(toKnowledgeChunk)
  }
}

function parseChunkConfig(value?: string): StructureAwareChunkConfig | undefined {
  if (!value?.trim()) {
    return undefined
  }
  try {
    return JSON.parse(value) as StructureAwareChunkConfig
  } catch {
    throw new BadRequestException('chunkConfig must be valid JSON')
  }
}

function normalizeChunkConfig(
  value?: Partial<StructureAwareChunkConfig> | Record<string, unknown> | null
): StructureAwareChunkConfig {
  const maxChars = positiveInteger(value?.maxChars, DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.maxChars)
  const targetChars = Math.min(
    positiveInteger(value?.targetChars, DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.targetChars),
    maxChars
  )
  const minChars = Math.min(
    positiveInteger(value?.minChars, DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.minChars),
    targetChars
  )

  return {
    targetChars,
    maxChars,
    minChars,
    overlapChars: Math.min(
      nonNegativeInteger(value?.overlapChars, DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.overlapChars),
      Math.floor(minChars / 2)
    )
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback
}

function assertIndexableContent(document: ParsedDocument, chunkCount: number): void {
  if (document.rawContent.trim() && chunkCount) {
    return
  }
  if (document.fileType !== 'pdf') {
    throw new UnprocessableEntityException(
      '文档没有可索引内容，请检查文件是否为空或格式是否正确。'
    )
  }

  const ocrMessages: Partial<Record<NonNullable<ParsedDocument['ocr']>['status'], string>> = {
    failed: document.ocr?.message ?? 'PDF OCR 识别失败，请稍后重试。',
    limit_reached: 'PDF 页数超过 OCR 处理上限，请调整 OCR_MAX_IMAGES_PER_DOCUMENT 后重试。',
    empty: 'OCR 已执行，但没有识别到可索引文字。'
  }
  const message = document.ocr?.status ? ocrMessages[document.ocr.status] : undefined
  throw new UnprocessableEntityException(
    message ??
      document.ocr?.message ??
      'PDF 未提取到可索引文字；请上传可复制文本的 PDF，或配置 OCR 后重新分块。'
  )
}

function buildChunkMetadata(
  document: KnowledgeDocumentEntity,
  parsed: ParsedDocument,
  blocks: StructuredBlock[]
): Record<string, unknown> {
  return {
    knowledgeBaseId: document.knowledgeBaseId,
    documentId: document.id,
    documentName: document.name,
    fileType: parsed.fileType,
    sourceKind: parsed.sourceKind,
    parser: parsed.parser,
    blockTypes: blocks.map(({ blockType }) => blockType),
    pageNumbers: uniqueDefined(blocks.map(({ pageNumber }) => pageNumber)),
    sectionPaths: blocks.map(({ sectionPath }) => sectionPath).filter(Boolean),
    titles: blocks.map(({ title }) => title).filter(Boolean),
    levels: blocks.map(({ level }) => level).filter((value) => value !== undefined),
    startOffsets: blocks.map(({ startOffset }) => startOffset).filter((value) => value !== undefined),
    endOffsets: blocks.map(({ endOffset }) => endOffset).filter((value) => value !== undefined),
    blockMetadatas: blocks.map(({ metadata }) => metadata).filter(Boolean),
    blocks: blocks.map((block) => ({ ...block, metadata: block.metadata ?? null }))
  }
}

function uniqueDefined<T>(values: (T | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))]
}

function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4))
}

function toKnowledgeDocument(entity: KnowledgeDocumentEntity): KnowledgeDocument {
  return {
    id: entity.id,
    knowledgeBaseId: entity.knowledgeBaseId,
    name: entity.name,
    sourceType: entity.sourceType,
    storagePath: entity.storagePath ?? null,
    fileType: entity.fileType ?? null,
    fileSizeBytes: entity.fileSizeBytes ? Number(entity.fileSizeBytes) : null,
    status: entity.status,
    chunkConfig: normalizeChunkConfig(entity.chunkConfig),
    chunkCount: entity.chunkCount,
    contentPreview: entity.contentPreview ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}

function toKnowledgeChunk(entity: KnowledgeChunkEntity): KnowledgeChunk {
  return {
    id: entity.id,
    documentId: entity.documentId,
    sequence: entity.sequence,
    content: entity.content,
    charCount: entity.charCount,
    tokenCount: entity.tokenCount,
    metadata: (entity.metadata as KnowledgeChunkMetadata | null) ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}
