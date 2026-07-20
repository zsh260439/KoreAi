import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  UnprocessableEntityException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { DataSource, IsNull, MoreThan, Not, Repository } from 'typeorm'
import { DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG } from 'share-type'
import type {
  KnowledgeChunk,
  KnowledgeChunkMetadata,
  KnowledgeDocument,
  KnowledgeDocumentRevision,
  KnowledgeDocumentTrash,
  KnowledgeDocumentSyncEvent,
  StructureAwareChunkConfig,
  UpdateKnowledgeDocumentInput
} from 'share-type'
import { CreateKnowledgeDocumentDto } from '../dto/create-knowledge-document.dto'
import { KnowledgeBaseEntity } from '../entity/knowledge-base.entity'
import { KnowledgeChunkEntity } from '../entity/knowledge-chunk.entity'
import { KnowledgeDocumentEntity } from '../entity/knowledge-document.entity'
import { KnowledgeDocumentRevisionEntity } from '../entity/knowledge-document-revision.entity'
import { EmbeddingService } from '../retrieval/embedding.service'
import { KnowledgeConfigService } from '../config/knowledge-config.service'
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

export const KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE = 'knowledge-document-cleanup'
export const KNOWLEDGE_DOCUMENT_REBUILD_QUEUE = 'knowledge-document-rebuild'
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const TRASH_QUOTA_BYTES = 5 * 1024 ** 3

export type KnowledgeDocumentUploadFields = {
  name?: string
  chunkConfig?: string
}

@Injectable()
export class KnowledgeDocumentService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly syncEvents: KnowledgeDocumentSyncEvent[] = []
  private syncTimer?: NodeJS.Timeout
  private syncRunning = false
  private lastSyncAt = 0

  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly documentRepo: Repository<KnowledgeDocumentEntity>,
    @InjectRepository(KnowledgeChunkEntity)
    private readonly chunkRepo: Repository<KnowledgeChunkEntity>,
    private readonly embeddingService: EmbeddingService,
    private readonly configService: KnowledgeConfigService,
    private readonly fileService: KnowledgeFileService,
    private readonly ocrService: KnowledgeOcrService,
    private readonly pdfParserService: KnowledgePdfParserService,
    private readonly dataSource: DataSource,
    @InjectQueue(KNOWLEDGE_DOCUMENT_CLEANUP_QUEUE)
    private readonly cleanupQueue: Queue<{ documentId: string; revisionId?: string }>,
    @InjectQueue(KNOWLEDGE_DOCUMENT_REBUILD_QUEUE)
    private readonly rebuildQueue: Queue<{ documentId: string }>
  ) {}

  onApplicationBootstrap(): void {
    void this.runScheduledSync()
    void this.restoreRevisionCleanupJobs().catch((error) => {
      console.warn(`[KnowledgeRevision] cleanup restore failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    })
    this.syncTimer = setInterval(() => void this.runScheduledSync(), 60_000)
  }

  onApplicationShutdown(): void {
    if (this.syncTimer) clearInterval(this.syncTimer)
  }

  findDocumentSyncEvents(): KnowledgeDocumentSyncEvent[] {
    return [...this.syncEvents]
  }

  async findKnowledgeDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
    const items = await this.documentRepo.find({
      where: { knowledgeBaseId, status: Not('inactive') },
      order: { updatedAt: 'DESC' }
    })
    return items.map(toKnowledgeDocument)
  }

  async findKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    return toKnowledgeDocument(await this.findEntity(documentId))
  }

  async findKnowledgeDocumentFile(documentId: string) {
    const document = await this.findEntity(documentId)
    if (!document.storagePath) {
      throw new NotFoundException('Document file is not available')
    }

    await this.readFileStats(document.storagePath)
    return {
      path: document.storagePath,
      name: document.name,
      fileType: document.fileType ?? inferKnowledgeDocumentFileType(document.storagePath)
    }
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

  async rebuildDocumentChunks(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.findEntity(documentId)
    if (document.status === 'processing') {
      return toKnowledgeDocument(document)
    }

    const previousStatus = document.status
    document.status = 'processing'
    const processingDocument = await this.documentRepo.save(document)

    try {
      // HTTP 请求只负责投递，耗时的解析与向量化交给 Worker。
      await this.rebuildQueue.add('rebuild', { documentId }, { jobId: `rebuild-${documentId}` })
    } catch (error) {
      document.status = previousStatus
      await this.documentRepo.save(document)
      throw error
    }

    return toKnowledgeDocument(processingDocument)
  }

  async processDocumentRebuild(documentId: string, markFailed: boolean): Promise<void> {
    const document = await this.findEntity(documentId)
    if (document.status !== 'processing') return

    try {
      const chunkConfig = normalizeChunkConfig(document.chunkConfig)
      const sourceHash = document.storagePath ? await hashFile(document.storagePath) : null
      const parsed = await this.parseDocument(document)
      const drafts = buildChunksFromBlocks(parsed.blocks, chunkConfig)
      assertIndexableContent(parsed, drafts.length)
      const hashes = drafts.map((draft) =>
        createKnowledgeChunkHash(draft.content, draft.blocks, this.embeddingService.fingerprint)
      )
      const oldChunks = document.activeRevisionId
        ? await this.chunkRepo
            .createQueryBuilder('chunk')
            .addSelect('chunk.embedding')
            .where('chunk.revisionId = :revisionId', { revisionId: document.activeRevisionId })
            .getMany()
        : []
      const oldEmbeddings = new Map(
        oldChunks
          .filter((chunk) => chunk.contentHash && chunk.embedding?.length)
          .map((chunk) => [chunk.contentHash!, chunk.embedding!])
      )
      const missingIndexes = hashes
        .map((hash, index) => (oldEmbeddings.has(hash) ? -1 : index))
        .filter((index) => index >= 0)
      const generated = await this.embeddingService.embedChunks(
        missingIndexes.map((index) => drafts[index]!.content)
      )
      const generatedByIndex = new Map(
        missingIndexes.map((index, position) => [index, generated[position] ?? null])
      )

      // 新版本完整写入后再切换，检索不会读到半套 Chunk。
      const archivedRevisionId = document.activeRevisionId
      const expiresAt = new Date(Date.now() + TRASH_RETENTION_MS)
      await this.dataSource.transaction(async (manager) => {
        const currentDocument = await manager.findOne(KnowledgeDocumentEntity, {
          where: { id: documentId, status: 'processing' },
          lock: { mode: 'pessimistic_write' }
        })
        if (!currentDocument) return

        const revision = await manager.save(
          manager.create(KnowledgeDocumentRevisionEntity, {
            documentId,
            sourceHash,
            chunkCount: drafts.length
          })
        )
        const chunks = drafts.map((draft, sequence) =>
          manager.create(KnowledgeChunkEntity, {
            documentId,
            revisionId: revision.id,
            content: draft.content,
            sequence,
            charCount: draft.content.length,
            tokenCount: estimateTokenCount(draft.content),
            contentHash: hashes[sequence],
            metadata: buildChunkMetadata(document, parsed, draft.blocks),
            embedding: oldEmbeddings.get(hashes[sequence]!) ?? generatedByIndex.get(sequence) ?? null,
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
            contentPreview: parsed.rawContent.slice(0, 500),
            contentHash: createHash('sha256').update(parsed.rawContent).digest('hex'),
            sourceHash,
            detectedSourceHash: null,
            sourceChangedAt: null,
            activeRevisionId: revision.id
          }
        )
        if (archivedRevisionId) {
          await manager.update(
            KnowledgeDocumentRevisionEntity,
            { id: archivedRevisionId, documentId },
            { expiresAt }
          )
        }
      })

      if (archivedRevisionId) {
        await this.scheduleRevisionCleanup(documentId, archivedRevisionId, expiresAt)
      }

    } catch (error) {
      if (markFailed) {
        await this.documentRepo.update({ id: documentId }, { status: 'failed' })
      }
      throw error
    }
  }

  async deleteKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.findEntity(documentId)
    const trashBytes = await this.getTrashBytes()
    if (trashBytes + Number(document.fileSizeBytes ?? 0) > TRASH_QUOTA_BYTES) {
      throw new ConflictException('回收站已达到 5GB，请先永久删除旧文档')
    }
    const previousStatus = document.status
    document.status = 'inactive'
    document.deletedAt = new Date()
    document.purgeAfter = new Date(Date.now() + TRASH_RETENTION_MS)
    const inactiveDocument = await this.documentRepo.save(document)

    try {
      await this.cleanupQueue.add('delete', { documentId }, {
        jobId: `purge-${documentId}`,
        delay: TRASH_RETENTION_MS
      })
    } catch (error) {
      document.status = previousStatus
      document.deletedAt = null
      document.purgeAfter = null
      await this.documentRepo.save(document)
      throw error
    }

    return toKnowledgeDocument(inactiveDocument)
  }

  async restoreKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.findEntity(documentId)
    if (document.status !== 'inactive') {
      throw new BadRequestException('文档不在回收站中')
    }
    document.status = 'indexed'
    document.deletedAt = null
    document.purgeAfter = null
    const restored = await this.documentRepo.save(document)
    try {
      await (await this.cleanupQueue.getJob(`purge-${documentId}`))?.remove()
    } catch {
      // Worker 的条件删除会再次检查 inactive，恢复与到期清理并发时仍不会误删。
    }
    if (document.storagePath && document.sourceHash) {
      try {
        if (await hashFile(document.storagePath) !== document.sourceHash) {
          return this.rebuildDocumentChunks(documentId)
        }
      } catch (error) {
        console.warn(`[KnowledgeRestore] ${document.name}: ${error instanceof Error ? error.message : 'scan failed'}`)
      }
    }
    return toKnowledgeDocument(restored)
  }

  async purgeKnowledgeDocument(documentId: string): Promise<void> {
    const document = await this.findEntity(documentId)
    if (document.status !== 'inactive') {
      throw new BadRequestException('只能永久删除回收站中的文档')
    }
    await (await this.cleanupQueue.getJob(`purge-${documentId}`))?.remove()
    document.purgeAfter = new Date()
    await this.documentRepo.save(document)
    await this.cleanupQueue.add('delete', { documentId }, { jobId: `purge-now-${documentId}` })
  }

  async findTrash(): Promise<KnowledgeDocumentTrash> {
    const items = await this.documentRepo.find({
      where: { status: 'inactive' },
      order: { deletedAt: 'ASC' }
    })
    return {
      items: items.map(toKnowledgeDocument),
      usedBytes: items.reduce((sum, item) => sum + Number(item.fileSizeBytes ?? 0), 0),
      quotaBytes: TRASH_QUOTA_BYTES,
      retentionDays: 7
    }
  }

  async findDocumentRevisions(documentId: string): Promise<KnowledgeDocumentRevision[]> {
    const document = await this.findEntity(documentId)
    const revisions = await this.dataSource
      .getRepository(KnowledgeDocumentRevisionEntity)
      .createQueryBuilder('revision')
      .where('revision.documentId = :documentId', { documentId })
      .andWhere('(revision.id = :activeRevisionId OR revision.expiresAt > NOW())', {
        activeRevisionId: document.activeRevisionId
      })
      .orderBy('revision.createdAt', 'DESC')
      .getMany()
    return revisions.map((revision) => ({
      id: revision.id,
      documentId,
      chunkCount: revision.chunkCount,
      active: revision.id === document.activeRevisionId,
      expiresAt: revision.expiresAt?.toISOString() ?? null,
      createdAt: revision.createdAt.toISOString()
    }))
  }

  async rollbackDocumentRevision(
    documentId: string,
    revisionId: string
  ): Promise<KnowledgeDocument> {
    const expiresAt = new Date(Date.now() + TRASH_RETENTION_MS)
    let archivedRevisionId: string | null = null

    await this.dataSource.transaction(async (manager) => {
      const document = await manager.findOne(KnowledgeDocumentEntity, {
        where: { id: documentId },
        lock: { mode: 'pessimistic_write' }
      })
      if (!document) throw new NotFoundException('Document not found')
      if (document.status !== 'indexed') {
        throw new ConflictException('Only indexed documents can roll back revisions')
      }
      if (document.activeRevisionId === revisionId) return

      const revision = await manager.findOneBy(KnowledgeDocumentRevisionEntity, {
        id: revisionId,
        documentId,
        expiresAt: MoreThan(new Date())
      })
      if (!revision) throw new NotFoundException('Revision is unavailable or expired')

      archivedRevisionId = document.activeRevisionId
      if (archivedRevisionId) {
        await manager.update(
          KnowledgeDocumentRevisionEntity,
          { id: archivedRevisionId, documentId },
          { expiresAt }
        )
      }
      await manager.update(
        KnowledgeDocumentRevisionEntity,
        { id: revisionId, documentId },
        { expiresAt: null }
      )
      await manager.update(
        KnowledgeDocumentEntity,
        { id: documentId },
        { activeRevisionId: revisionId, chunkCount: revision.chunkCount }
      )
    })

    await (await this.cleanupQueue.getJob(`purge-revision-${revisionId}`))?.remove()
    if (archivedRevisionId) {
      await this.scheduleRevisionCleanup(documentId, archivedRevisionId, expiresAt)
    }
    return this.findKnowledgeDocument(documentId)
  }

  private async getTrashBytes(): Promise<number> {
    const result = await this.documentRepo
      .createQueryBuilder('document')
      .select('COALESCE(SUM(document.fileSizeBytes), 0)', 'bytes')
      .where('document.status = :status', { status: 'inactive' })
      .getRawOne<{ bytes: string }>()
    return Number(result?.bytes ?? 0)
  }

  private async scheduleRevisionCleanup(
    documentId: string,
    revisionId: string,
    expiresAt: Date
  ): Promise<void> {
    await this.cleanupQueue.add(
      'delete-revision',
      { documentId, revisionId },
      {
        jobId: `purge-revision-${revisionId}`,
        delay: Math.max(0, expiresAt.getTime() - Date.now())
      }
    )
  }

  private async restoreRevisionCleanupJobs(): Promise<void> {
    const revisions = await this.dataSource.getRepository(KnowledgeDocumentRevisionEntity).find({
      where: { expiresAt: Not(IsNull()) }
    })
    await Promise.all(
      revisions.map((revision) =>
        this.scheduleRevisionCleanup(revision.documentId, revision.id, revision.expiresAt!)
      )
    )
  }

  private async runScheduledSync(): Promise<void> {
    if (this.syncRunning) return
    this.syncRunning = true
    try {
      const { runtimeConfig } = await this.configService.findProviderSettings()
      if (!isKnowledgeSyncDue(this.lastSyncAt, runtimeConfig.documents.syncIntervalHours)) return
      this.lastSyncAt = Date.now()
      await this.scanStoredDocuments(runtimeConfig.documents.autoSync)
    } catch (error) {
      console.warn(`[KnowledgeSync] scan failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      this.syncRunning = false
    }
  }

  private async scanStoredDocuments(autoSync: boolean): Promise<void> {
    await this.backfillChunkHashes()
    const documents = await this.documentRepo.find({
      where: { status: 'indexed', sourceType: 'file' }
    })

    for (const document of documents) {
      if (!document.storagePath) continue

      try {
        const sourceHash = await hashFile(document.storagePath)
        if (!document.sourceHash) {
          // 旧数据首次升级时没有比较基线，只记录当前内容，不能猜测它已经变化。
          await this.documentRepo.update(document.id, { sourceHash, detectedSourceHash: null })
          continue
        }
        if (sourceHash === document.sourceHash) {
          if (document.sourceChangedAt || document.detectedSourceHash) {
            await this.documentRepo.update(document.id, { sourceChangedAt: null, detectedSourceHash: null })
          }
          continue
        }
        if (sourceHash === document.detectedSourceHash) continue

        const detectedAt = new Date()
        await this.documentRepo.update(document.id, {
          sourceChangedAt: detectedAt,
          detectedSourceHash: sourceHash,
          lastAutoSyncAt: null
        })
        if (autoSync) {
          await this.rebuildDocumentChunks(document.id)
          await this.documentRepo.update(document.id, { lastAutoSyncAt: detectedAt })
        }
        this.syncEvents.push({
          id: `${document.id}:${detectedAt.getTime()}`,
          documentId: document.id,
          documentName: document.name,
          autoRebuild: autoSync,
          detectedAt: detectedAt.toISOString()
        })
        if (this.syncEvents.length > 100) this.syncEvents.shift()
      } catch (error) {
        console.warn(`[KnowledgeSync] ${document.name}: ${error instanceof Error ? error.message : 'scan failed'}`)
      }
    }
  }

  private async backfillChunkHashes(): Promise<void> {
    const chunks = await this.chunkRepo.find({ where: { contentHash: IsNull() } })
    for (const chunk of chunks) {
      const metadata = chunk.metadata as KnowledgeChunkMetadata | null
      chunk.contentHash = createKnowledgeChunkHash(chunk.content, metadata?.blocks ?? [])
    }
    if (chunks.length) await this.chunkRepo.save(chunks, { chunk: 500 })
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
      .innerJoin(KnowledgeDocumentEntity, 'document', 'document.id = chunk.documentId')
      .where('chunk.documentId = :documentId', { documentId })
      .andWhere('chunk.revisionId = document.activeRevisionId')
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
    contentHash: entity.contentHash,
    sourceHash: entity.sourceHash,
    detectedSourceHash: entity.detectedSourceHash,
    sourceChangedAt: entity.sourceChangedAt?.toISOString() ?? null,
    lastAutoSyncAt: entity.lastAutoSyncAt?.toISOString() ?? null,
    deletedAt: entity.deletedAt?.toISOString() ?? null,
    purgeAfter: entity.purgeAfter?.toISOString() ?? null,
    activeRevisionId: entity.activeRevisionId,
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
    contentHash: entity.contentHash,
    metadata: (entity.metadata as KnowledgeChunkMetadata | null) ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  }
}

async function hashFile(storagePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(storagePath)).digest('hex')
}

export function isKnowledgeSyncDue(lastSyncAt: number, intervalHours: number, now = Date.now()): boolean {
  return !lastSyncAt || now - lastSyncAt >= intervalHours * 60 * 60 * 1000
}

type HashableBlock = Pick<StructuredBlock, 'blockType' | 'title' | 'pageNumber' | 'level' | 'sectionPath'>

export function createKnowledgeChunkHash(
  content: string,
  blocks: HashableBlock[],
  embeddingFingerprint = ''
): string {
  const structure = blocks.map(({ blockType, title, pageNumber, level, sectionPath }) => ({
    blockType,
    title,
    pageNumber,
    level,
    sectionPath
  }))
  return createHash('sha256')
    .update(JSON.stringify({ content, structure, embeddingFingerprint }))
    .digest('hex')
}
