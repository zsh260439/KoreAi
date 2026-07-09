import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { stat } from "node:fs/promises";
import { DataSource, Repository } from "typeorm";
import type {
  KnowledgeBase,
  KnowledgeBaseRuntimeConfig,
  KnowledgeBaseRuntimeConfigPatch,
  KnowledgeGlobalRuntimeSettings,
  KnowledgeBaseStatus,
  KnowledgeChunk,
  KnowledgeChunkMetadata,
  KnowledgeDocument,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  KnowledgeSearchResponse,
  StructureAwareChunkConfig,
  UpdateKnowledgeBaseInput,
  UpdateKnowledgeDocumentInput,
} from "share-type";
import { EmbeddingService } from "./composables/embedding.service";
import {
  getKnowledgeDocumentBaseName,
  inferKnowledgeDocumentFileType,
  KnowledgeFileService,
  type UploadedKnowledgeDocumentFile,
} from "./composables/knowledge-file.service";
import {
  KnowledgeQaService,
  type KnowledgeQaStreamEvent,
} from "./composables/knowledge-qa.service";
import { KnowledgeVectorStoreService } from "./composables/knowledge-vector-store.service";
import { CreateKnowledgeBaseDto } from "./dto/create-knowledge-base.dto";
import { CreateKnowledgeDocumentDto } from "./dto/create-knowledge-document.dto";
import { KnowledgeBaseEntity } from "./entity/knowledge-base.entity";
import { KnowledgeChunkEntity } from "./entity/knowledge-chunk.entity";
import { KnowledgeDocumentEntity } from "./entity/knowledge-document.entity";
import { KnowledgeRuntimeSettingsEntity } from "./entity/knowledge-runtime-settings.entity";
import { buildChunksFromBlocks } from "./composables/knowledge-chunk-builder";
import { parseKnowledgeDocument } from "./composables/knowledge-document.parser";
import { KnowledgeRetrievalService } from "./composables/knowledge-retrieval.service";
import { buildKnowledgeChunkSearchableFields } from "./composables/knowledge-searchable-fields";
import {
  DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
  mergeKnowledgeBaseRuntimeConfig,
  normalizeKnowledgeBaseRuntimeConfig,
} from "./composables/knowledge-runtime-config";
//声明知识问答流式输入结构
type KnowledgeAskStreamInput = {
  query: string;
  knowledgeBaseId?: string;
  topK?: number;
  think?: boolean;
  rewrite?: boolean;
};

//声明知识问答流式返回结构
type KnowledgeAskStream = {
  sources: KnowledgeSearchHit[];
  retrievalDebug: KnowledgeSearchDebugInfo | null;
  model: string | null;
  totalTokens: Promise<number | null>;
  stream: AsyncGenerator<KnowledgeQaStreamEvent>;
};

//声明结构化分块默认配置
const DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG: StructureAwareChunkConfig = {
  targetChars: 700,
  maxChars: 900,
  minChars: 300,
  overlapChars: 80,
};

type UploadKnowledgeDocumentInput = {
  name?: string;
  chunkConfig?: string;
};

const GLOBAL_RUNTIME_SCOPE = "global";

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(KnowledgeBaseEntity)
    private readonly knowledgeBaseRepo: Repository<KnowledgeBaseEntity>,
    @InjectRepository(KnowledgeDocumentEntity)
    private readonly knowledgeDocumentRepo: Repository<KnowledgeDocumentEntity>,
    @InjectRepository(KnowledgeChunkEntity)
    private readonly knowledgeChunkRepo: Repository<KnowledgeChunkEntity>,
    @InjectRepository(KnowledgeRuntimeSettingsEntity)
    private readonly knowledgeRuntimeSettingsRepo: Repository<KnowledgeRuntimeSettingsEntity>,
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeFileService: KnowledgeFileService,
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeQaService: KnowledgeQaService,
    private readonly knowledgeRetrievalService: KnowledgeRetrievalService,
    private readonly dataSource: DataSource,
  ) {}

  //声明知识库搜索入口
  async searchKnowledge(
    dto: KnowledgeSearchInput,
  ): Promise<KnowledgeSearchResponse> {
    // 这里保持最基础的空查询校验，避免调试面板被无效请求污染
    const query = dto.query.trim();
    if (!query) {
      throw new BadRequestException("query cannot be empty");
    }

    const runtimeConfig = await this.getRuntimeConfig(dto.knowledgeBaseId);
    // 搜索接口要把命中结果和 debug 一起返回给 admin preview 面板
    return this.knowledgeRetrievalService.retrieveKnowledge(
      dto.knowledgeBaseId,
      query,
      runtimeConfig.retrieval.previewTopK,
      {
        enableRewrite: dto.rewrite !== false,
        runtimeConfig,
      },
    );
  }

  //声明流式知识问答入口
  async streamAskKnowledge(
    dto: KnowledgeAskStreamInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<KnowledgeAskStream> {
    const query = dto.query.trim();
    if (!query) {
      throw new BadRequestException("query cannot be empty");
    }

    const runtimeConfig = await this.getRuntimeConfig(dto.knowledgeBaseId);
    const topK = normalizeTopK(
      dto.topK,
      runtimeConfig.retrieval.workspaceTopK,
    );
    // 问答链路复用同一套检索逻辑，并把 debug 单独返回给 workspace 展示层使用。
    const retrievalResult = await this.knowledgeRetrievalService.retrieveKnowledge(
      dto.knowledgeBaseId,
      query,
      topK,
      {
        enableRewrite: dto.rewrite !== false,
        runtimeConfig,
      },
    );
    const sources = retrievalResult.hits
    const qaStream = await this.knowledgeQaService.streamAnswerQuestion(
      query,
      sources,
      {
        includeReasoning: dto.think,
        signal: options.signal,
        temperature: runtimeConfig.answer.temperature,
      },
    );

    return {
      sources,
      retrievalDebug: retrievalResult.debug,
      model: this.knowledgeQaService.getModelName(),
      totalTokens: qaStream.totalTokens,
      stream: qaStream.stream,
    };
  }

  //声明知识库列表查询
  async findKnowledgeBases(): Promise<KnowledgeBase[]> {
    const [items, documentCounts] = await Promise.all([
      this.knowledgeBaseRepo.find({
        order: { updatedAt: "DESC" },
      }),
      this.knowledgeDocumentRepo
        .createQueryBuilder("document")
        .select("document.knowledgeBaseId", "knowledgeBaseId")
        .addSelect("COUNT(*)", "count")
        .groupBy("document.knowledgeBaseId")
        .getRawMany<{ knowledgeBaseId: string; count: string }>(),
    ]);

    const documentCountMap = new Map(
      documentCounts.map((item) => [
        item.knowledgeBaseId,
        Number(item.count) || 0,
      ]),
    );

    return items.map((item) =>
      toKnowledgeBase(item, documentCountMap.get(item.id) ?? 0),
    );
  }

  //声明知识库运行配置查询入口，供 workspace 和后续 admin 参数页复用。
  async findKnowledgeBaseRuntimeConfig(
    knowledgeBaseId: string,
  ): Promise<KnowledgeBaseRuntimeConfig> {
    return this.getRuntimeConfig(knowledgeBaseId)
  }

  //声明全局召回运行配置查询入口，供“全部知识库”召回和 admin 参数页复用。
  async findGlobalRuntimeSettings(): Promise<KnowledgeGlobalRuntimeSettings> {
    const entity = await this.getOrCreateGlobalRuntimeSettingsEntity();
    return toKnowledgeGlobalRuntimeSettings(entity);
  }

  //声明全局召回运行配置更新入口，只影响未指定 knowledgeBaseId 的全库召回路径。
  async updateGlobalRuntimeSettings(
    runtimeConfig: KnowledgeBaseRuntimeConfigPatch,
  ): Promise<KnowledgeGlobalRuntimeSettings> {
    const entity = await this.getOrCreateGlobalRuntimeSettingsEntity();
    entity.runtimeConfig = mergeKnowledgeBaseRuntimeConfig(
      entity.runtimeConfig,
      runtimeConfig,
    );

    const updated = await this.knowledgeRuntimeSettingsRepo.save(entity);
    return toKnowledgeGlobalRuntimeSettings(updated);
  }

  //声明知识库创建
  async createKnowledgeBase(
    dto: CreateKnowledgeBaseDto,
  ): Promise<KnowledgeBase> {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Knowledge base name cannot be empty");
    }

    const entity = this.knowledgeBaseRepo.create({
      name,
      description: dto.description?.trim() || null,
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
    });

    const created = await this.knowledgeBaseRepo.save(entity);
    return toKnowledgeBase(created, 0);
  }

  //声明知识库更新
  async updateKnowledgeBase(
    knowledgeBaseId: string,
    dto: UpdateKnowledgeBaseInput,
  ): Promise<KnowledgeBase> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    if (typeof dto.name === "string") {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Knowledge base name cannot be empty");
      }
      kb.name = name;
    }

    if (typeof dto.description === "string") {
      kb.description = dto.description.trim() || null;
    }

    if (dto.runtimeConfig) {
      kb.runtimeConfig = mergeKnowledgeBaseRuntimeConfig(
        kb.runtimeConfig,
        dto.runtimeConfig,
      );
    }

    const updated = await this.knowledgeBaseRepo.save(kb);
    return toKnowledgeBase(updated);
  }

  //声明知识库文档列表查询
  async findKnowledgeDocuments(
    knowledgeBaseId: string,
  ): Promise<KnowledgeDocument[]> {
    const items = await this.knowledgeDocumentRepo.find({
      where: { knowledgeBaseId },
      order: { updatedAt: "DESC" },
    });

    return items.map(toKnowledgeDocument);
  }

  //声明单个文档详情查询
  async findKnowledgeDocument(documentId: string): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    return toKnowledgeDocument(document);
  }

  //声明文档可编辑配置更新
  async updateKnowledgeDocument(
    docId: string,
    dto: UpdateKnowledgeDocumentInput,
  ): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: docId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    if (typeof dto.name === "string") {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Document name cannot be empty");
      }
      document.name = name;
    }

    if (dto.chunkConfig) {
      document.chunkConfig = normalizeStructureAwareChunkConfig(
        dto.chunkConfig,
      );
    }

    await this.knowledgeDocumentRepo.save(document);
    return toKnowledgeDocument(document);
  }

  //声明知识库文档创建
  async createKnowledgeDocument(
    knowledgeBaseId: string,
    dto: CreateKnowledgeDocumentDto,
  ): Promise<KnowledgeDocument> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("Document name cannot be empty");
    }

    const storagePath = dto.storagePath.trim();
    if (!storagePath) {
      throw new BadRequestException("storagePath cannot be empty");
    }

    //声明当前阶段只允许本地文本类文件入库

    const fileStats = await this.readLocalFileStats(storagePath);
    const fileType = inferKnowledgeDocumentFileType(storagePath);
    const entity = this.knowledgeDocumentRepo.create({
      knowledgeBaseId,
      name,
      sourceType: "file",
      storagePath,
      fileType,
      fileSizeBytes: String(fileStats.size),
      chunkConfig: normalizeStructureAwareChunkConfig(dto.chunkConfig),
      status: "pending",
    });

    const created = await this.knowledgeDocumentRepo.save(entity);
    return toKnowledgeDocument(created);
  }

  //声明知识库文档上传
  async uploadKnowledgeDocument(
    knowledgeBaseId: string,
    input: UploadKnowledgeDocumentInput,
    file?: UploadedKnowledgeDocumentFile,
  ): Promise<KnowledgeDocument> {
    if (!file) {
      throw new BadRequestException("file is required");
    }

    this.knowledgeFileService.validateFile(file);

    const fallbackName =
      getKnowledgeDocumentBaseName(file.originalname) || "新文档";
    const storagePath = await this.knowledgeFileService.saveFile(
      knowledgeBaseId,
      file,
    );
    const chunkConfig = parseUploadedChunkConfig(input.chunkConfig);

    try {
      return await this.createKnowledgeDocument(knowledgeBaseId, {
        name: input.name?.trim() || fallbackName,
        storagePath,
        chunkConfig,
      });
    } catch (error) {
      await this.knowledgeFileService.deleteFileSafely(storagePath);
      throw error;
    }
  }

  //声明文档分块列表查询
  async findDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    return this.loadDocumentChunks(documentId);
  }

  //声明文档分块重建
  async rebuildDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    await this.knowledgeDocumentRepo.update(
      { id: documentId },
      { status: "processing" },
    );

    try {
      const chunkConfig = normalizeStructureAwareChunkConfig(
        document.chunkConfig,
      );
      const parsedDocument = await parseKnowledgeDocument(
        document.storagePath ?? "",
      );
      const chunkDrafts = buildChunksFromBlocks(
        parsedDocument.blocks,
        chunkConfig,
      );
      const embeddings = await this.embeddingService.embedChunks(
        chunkDrafts.map((item) => item.content),
      );

      await this.dataSource.transaction(async (manager) => {
        await manager.delete(KnowledgeChunkEntity, { documentId });

        const chunkEntities = chunkDrafts.map((chunk, index) =>
          manager.create(KnowledgeChunkEntity, {
            documentId,
            content: chunk.content,
            sequence: index,
            charCount: chunk.content.length,
            tokenCount: estimateTokenCount(chunk.content),
            metadata: buildChunkMetadata(
              document,
              parsedDocument,
              chunk.blocks,
            ),
            embedding: embeddings[index]?.length ? embeddings[index] : null,
            ...buildKnowledgeChunkSearchableFields(
              document,
              parsedDocument,
              chunk.blocks,
            ),
          }),
        );

        if (chunkEntities.length > 0) {
          await manager.save(chunkEntities);
        }

        await manager.update(
          KnowledgeDocumentEntity,
          { id: documentId },
          {
            status: "indexed",
            chunkConfig,
            chunkCount: chunkEntities.length,
            contentPreview: parsedDocument.rawContent.slice(0, 500),
          },
        );
      });

      return this.loadDocumentChunks(documentId);
    } catch (error) {
      await this.knowledgeDocumentRepo.update(
        { id: documentId },
        { status: "failed" },
      );
      throw error;
    }
  }

  async deleteKnowledgeBase(knowledgeBaseId: string): Promise<KnowledgeBase> {
    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId },
      relations: { documents: true },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    await this.knowledgeBaseRepo.delete({ id: knowledgeBaseId });
    return toKnowledgeBase(kb);
  }

  //声明单个文档删除
  async deleteKnowledgeDocument(
    documentId: string,
  ): Promise<KnowledgeDocument> {
    const document = await this.knowledgeDocumentRepo.findOne({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    await this.knowledgeDocumentRepo.delete({ id: documentId });
    return toKnowledgeDocument(document);
  }



  //声明从 storagePath 读取真实文档正文
  private async readLocalFileStats(storagePath: string) {
    try {
      return await stat(storagePath);
    } catch {
      throw new NotFoundException(`File not found: ${storagePath}`);
    }
  }

  //声明知识库存在性校验
  private async getRuntimeConfig(
    knowledgeBaseId?: string,
  ): Promise<KnowledgeBaseRuntimeConfig> {
    if (!knowledgeBaseId) {
      const globalSettings = await this.getGlobalRuntimeConfig();
      return globalSettings;
    }

    const kb = await this.knowledgeBaseRepo.findOne({
      where: { id: knowledgeBaseId },
    });

    if (!kb) {
      throw new NotFoundException("Knowledge base not found");
    }

    return normalizeKnowledgeBaseRuntimeConfig(kb.runtimeConfig);
  }

  //声明全局配置读取逻辑；如果数据库里还没有记录，就先回退默认值。
  private async getGlobalRuntimeConfig(): Promise<KnowledgeBaseRuntimeConfig> {
    const entity = await this.knowledgeRuntimeSettingsRepo.findOne({
      where: { scope: GLOBAL_RUNTIME_SCOPE },
    });

    if (!entity) {
      return DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG;
    }

    return normalizeKnowledgeBaseRuntimeConfig(entity.runtimeConfig);
  }

  //声明全局配置实体装载逻辑；admin 页面首次保存前若还没有记录，这里负责创建单行默认记录。
  private async getOrCreateGlobalRuntimeSettingsEntity(): Promise<KnowledgeRuntimeSettingsEntity> {
    const existing = await this.knowledgeRuntimeSettingsRepo.findOne({
      where: { scope: GLOBAL_RUNTIME_SCOPE },
    });

    if (existing) {
      return existing;
    }

    const created = this.knowledgeRuntimeSettingsRepo.create({
      scope: GLOBAL_RUNTIME_SCOPE,
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
    });

    return this.knowledgeRuntimeSettingsRepo.save(created);
  }
  //声明文档 chunk 装载
  private async loadDocumentChunks(
    documentId: string,
  ): Promise<KnowledgeChunk[]> {
    const items = await this.knowledgeChunkRepo
      .createQueryBuilder("chunk")
      .addSelect("chunk.metadata")
      .where("chunk.documentId = :documentId", { documentId })
      .orderBy("chunk.sequence", "ASC")
      .getMany();

    return items.map(toKnowledgeChunk);
  }
}
//声明上传分块配置解析
function parseUploadedChunkConfig(
  value?: string,
): StructureAwareChunkConfig | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as StructureAwareChunkConfig;
  } catch {
    throw new BadRequestException("chunkConfig must be valid JSON");
  }
}

//声明结构化分块配置归一化
function normalizeStructureAwareChunkConfig(
  value?: Partial<StructureAwareChunkConfig> | Record<string, unknown> | null,
): StructureAwareChunkConfig {
  const maxChars = normalizePositiveInteger(
    value?.maxChars,
    DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.maxChars,
  );
  const targetChars = Math.min(
    normalizePositiveInteger(
      value?.targetChars,
      DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.targetChars,
    ),
    maxChars,
  );
  const minChars = Math.min(
    normalizePositiveInteger(
      value?.minChars,
      DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.minChars,
    ),
    targetChars,
  );
  const overlapChars = Math.min(
    normalizeNonNegativeInteger(
      value?.overlapChars,
      DEFAULT_STRUCTURE_AWARE_CHUNK_CONFIG.overlapChars,
    ),
    Math.floor(minChars / 2),
  );

  return {
    targetChars,
    maxChars,
    minChars,
    overlapChars,
  };
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue <= 0) {
    return fallback;
  }

  return Math.floor(normalizedValue);
}

//声明非负整数配置归一化
function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  const normalizedValue = Number(value);
  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    return fallback;
  }

  return Math.floor(normalizedValue);
}

//声明近似 token 估算逻辑
function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

//声明分块元数据构建逻辑
function buildChunkMetadata(
  document: KnowledgeDocumentEntity,
  parsedDocument: { fileType: string; sourceKind: string },
  blocks: {
    blockType: string;
    content: string;
    pageNumber?: number;
    sectionPath?: string[];
    level?: number;
    title?: string;
    startOffset?: number;
    endOffset?: number;
    metadata?: Record<string, unknown>;
  }[],
): Record<string, unknown> {
  return {
    knowledgeBaseId: document.knowledgeBaseId,
    documentId: document.id,
    documentName: document.name,
    fileType: parsedDocument.fileType,
    sourceKind: parsedDocument.sourceKind,
    blockTypes: blocks.map((item) => item.blockType),
    pageNumbers: Array.from(
      new Set(
        blocks
          .map((item) => item.pageNumber)
          .filter((value) => value !== undefined),
      ),
    ),
    sectionPaths: blocks.map((item) => item.sectionPath).filter(Boolean),
    titles: blocks.map((item) => item.title).filter(Boolean),
    levels: blocks
      .map((item) => item.level)
      .filter((value) => value !== undefined),
    startOffsets: blocks
      .map((item) => item.startOffset)
      .filter((value) => value !== undefined),
    endOffsets: blocks
      .map((item) => item.endOffset)
      .filter((value) => value !== undefined),
    blockMetadatas: blocks.map((item) => item.metadata).filter(Boolean),
    blocks: blocks.map((item) => ({
      blockType: item.blockType,
      content: item.content,
      title: item.title,
      pageNumber: item.pageNumber,
      level: item.level,
      sectionPath: item.sectionPath,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      metadata: item.metadata ?? null,
    })),
  };
}

function toKnowledgeBase(
  entity: KnowledgeBaseEntity,
  documentCount = entity.documents?.length ?? 0,
): KnowledgeBase {
  const normalizedStatus: KnowledgeBaseStatus =
    entity.status === "active" ? "active" : "draft";

  return {
    id: entity.id,
    name: entity.name,
    description: entity.description ?? "",
    status: normalizedStatus,
    documentCount,
    runtimeConfig: normalizeKnowledgeBaseRuntimeConfig(entity.runtimeConfig),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

//声明全局召回配置实体映射逻辑
function toKnowledgeGlobalRuntimeSettings(
  entity: KnowledgeRuntimeSettingsEntity,
): KnowledgeGlobalRuntimeSettings {
  return {
    scope: "global",
    runtimeConfig: normalizeKnowledgeBaseRuntimeConfig(entity.runtimeConfig),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

//声明 topK 规范化逻辑
function normalizeTopK(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), 1), 50);
}

//声明文档实体映射逻辑
function toKnowledgeDocument(
  entity: KnowledgeDocumentEntity,
): KnowledgeDocument {
  return {
    id: entity.id,
    knowledgeBaseId: entity.knowledgeBaseId,
    name: entity.name,
    sourceType: entity.sourceType,
    storagePath: entity.storagePath ?? null,
    fileType: entity.fileType ?? null,
    fileSizeBytes: entity.fileSizeBytes ? Number(entity.fileSizeBytes) : null,
    status: entity.status,
    chunkConfig: normalizeStructureAwareChunkConfig(entity.chunkConfig),
    chunkCount: entity.chunkCount,
    contentPreview: entity.contentPreview ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

//声明分块实体映射逻辑
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
    updatedAt: entity.updatedAt.toISOString(),
  };
}
