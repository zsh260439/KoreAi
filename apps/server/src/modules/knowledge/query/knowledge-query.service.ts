import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  KnowledgeQaDeltaEvent,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  KnowledgeSearchResponse
} from 'share-type'
import { KnowledgeQaService, type KnowledgeQaStreamEvent } from '../answer/knowledge-qa.service'
import { KnowledgeConfigService } from '../config/knowledge-config.service'
import { KnowledgeRetrievalService } from '../retrieval/knowledge-retrieval.service'

export type KnowledgeAnswerStreamInput = {
  query: string
  knowledgeBaseId?: string
  topK?: number
  think?: boolean
  rewrite?: boolean
}

export type KnowledgeAnswerStream = {
  sources: KnowledgeSearchHit[]
  retrievalDebug: KnowledgeSearchDebugInfo | null
  model: string | null
  totalTokens: Promise<number | null>
  stream: AsyncGenerator<KnowledgeQaStreamEvent>
}

@Injectable()
export class KnowledgeQueryService {
  constructor(
    private readonly configService: KnowledgeConfigService,
    private readonly retrievalService: KnowledgeRetrievalService,
    private readonly qaService: KnowledgeQaService
  ) {}

  async searchKnowledge(dto: KnowledgeSearchInput): Promise<KnowledgeSearchResponse> {
    const query = requireQuery(dto.query)
    const runtimeConfig = await this.configService.getRuntimeConfig(dto.knowledgeBaseId)

    return this.retrievalService.retrieveKnowledge(
      dto.knowledgeBaseId,
      query,
      runtimeConfig.retrieval.previewTopK,
      { enableRewrite: dto.rewrite !== false, runtimeConfig }
    )
  }

  async streamAnswer(
    dto: KnowledgeAnswerStreamInput,
    options: { signal?: AbortSignal } = {}
  ): Promise<KnowledgeAnswerStream> {
    const query = requireQuery(dto.query)
    const runtimeConfig = await this.configService.getRuntimeConfig(dto.knowledgeBaseId)
    const retrievalResult = await this.retrievalService.retrieveKnowledge(
      dto.knowledgeBaseId,
      query,
      normalizeTopK(dto.topK, runtimeConfig.retrieval.workspaceTopK),
      { enableRewrite: dto.rewrite !== false, runtimeConfig }
    )
    const sources = retrievalResult.hits

    if (retrievalResult.debug?.evidenceGateStatus === 'blocked') {
      return {
        sources,
        retrievalDebug: retrievalResult.debug,
        model: await this.qaService.getModelName(),
        totalTokens: Promise.resolve(null),
        stream: staticAnswerStream(
          '检索到的证据不足，无法基于当前知识库给出准确回答。请补充更明确的问题、指定知识库范围，或先完善相关文档后再查询。'
        )
      }
    }

    const answer = await this.qaService.streamAnswerQuestion(query, sources, {
      includeReasoning: dto.think,
      signal: options.signal,
      temperature: runtimeConfig.answer.temperature,
      evidenceGateStatus: retrievalResult.debug?.evidenceGateStatus,
      evidenceCoverage: retrievalResult.debug?.evidenceCoverage,
      retrievalDebug: retrievalResult.debug
    })

    return {
      sources,
      retrievalDebug: retrievalResult.debug,
      model: await this.qaService.getModelName(),
      totalTokens: answer.totalTokens,
      stream: answer.stream
    }
  }
}

function requireQuery(value: string): string {
  const query = value.trim()
  if (!query) {
    throw new BadRequestException('query cannot be empty')
  }
  return query
}

function normalizeTopK(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(Math.floor(value), 1), 50)
    : fallback
}

// 证据门禁阻止模型调用时，仍沿用相同流式契约返回可展示结果。
async function* staticAnswerStream(answer: string): AsyncGenerator<KnowledgeQaDeltaEvent> {
  yield { type: 'answer_delta', delta: answer }
}
