import { BadRequestException, Injectable } from '@nestjs/common'
import type {
  KnowledgeQaDeltaEvent,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  KnowledgeSearchResponse
} from 'share-type'
import { KnowledgeQaService, type KnowledgeQaStreamEvent } from '../answer-generation/knowledge-qa.service'
import { KnowledgeConfigService } from '../../runtime/config/knowledge-config.service'
import { KnowledgeRetrievalService } from '../candidate-retrieval/knowledge-retrieval.service'

export type KnowledgeAnswerStreamInput = {
  query: string
  knowledgeBaseId?: string
  topK?: number
  think?: boolean
  rewrite?: boolean
  generalKnowledgeOnly?: boolean
  retrievalHints?: string[]
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
      { forceRewrite: dto.rewrite === true, runtimeConfig }
    )
  }

  async streamAnswer(
    dto: KnowledgeAnswerStreamInput,
    options: { signal?: AbortSignal } = {}
  ): Promise<KnowledgeAnswerStream> {
    const query = requireQuery(dto.query)
    const runtimeConfig = await this.configService.getRuntimeConfig(dto.knowledgeBaseId)
    if (dto.generalKnowledgeOnly) {
      const answer = await this.qaService.streamAnswerQuestion(query, [], {
        includeReasoning: dto.think,
        signal: options.signal,
        temperature: runtimeConfig.answer.temperature,
        evidenceGateStatus: 'blocked',
        evidenceCoverage: 0,
        retrievalDebug: null
      })

      return {
        sources: [],
        retrievalDebug: null,
        model: await this.qaService.getModelName(),
        totalTokens: answer.totalTokens,
        stream: answer.stream
      }
    }

    const retrievalResult = await this.retrievalService.retrieveKnowledge(
      dto.knowledgeBaseId,
      query,
      normalizeTopK(dto.topK, runtimeConfig.retrieval.workspaceTopK),
      {
        forceRewrite: dto.rewrite === true,
        runtimeConfig,
        retrievalHints: dto.retrievalHints
      }
    )
    const sources = retrievalResult.hits
    const allowGeneralKnowledge = shouldAllowMixedKnowledgeAnswer(query)

    if (retrievalResult.debug?.evidenceGateStatus === 'blocked') {
      if (allowGeneralKnowledge) {
        const answer = await this.qaService.streamAnswerQuestion(query, sources, {
          includeReasoning: dto.think,
          signal: options.signal,
          temperature: runtimeConfig.answer.temperature,
          evidenceGateStatus: 'degraded',
          evidenceCoverage: retrievalResult.debug.evidenceCoverage,
          retrievalDebug: retrievalResult.debug,
          allowGeneralKnowledge: true
        })

        return {
          sources,
          retrievalDebug: retrievalResult.debug,
          model: await this.qaService.getModelName(),
          totalTokens: answer.totalTokens,
          stream: answer.stream
        }
      }

      if (shouldUseGeneralKnowledgeFallback(query, retrievalResult.debug)) {
        const answer = await this.qaService.streamAnswerQuestion(query, [], {
          includeReasoning: dto.think,
          signal: options.signal,
          temperature: runtimeConfig.answer.temperature,
          evidenceGateStatus: 'blocked',
          evidenceCoverage: retrievalResult.debug.evidenceCoverage,
          retrievalDebug: retrievalResult.debug
        })

        return {
          sources: [],
          retrievalDebug: retrievalResult.debug,
          model: await this.qaService.getModelName(),
          totalTokens: answer.totalTokens,
          stream: answer.stream
        }
      }

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
      retrievalDebug: retrievalResult.debug,
      allowGeneralKnowledge
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
function shouldUseGeneralKnowledgeFallback(
  query: string,
  debug: KnowledgeSearchDebugInfo | null
): boolean {
  if (debug?.llmIntent === 'exploratory' || debug?.routeType === 'semantic_heavy') {
    return true
  }

  if (debug?.routeType === 'exact_lookup' && hasStructuredProtectedTerm(debug)) {
    return false
  }

  return /学习|新手|介绍|解释|原理|教程|怎么用|如何使用|是什么|区别|入门|概念|redis|database|cache/i.test(query)
}

function shouldAllowMixedKnowledgeAnswer(query: string): boolean {
  return /(?:结合|整合|综合).{0,12}(?:本地|知识库|rag).{0,20}(?:通用|常识|general)|(?:本地|知识库|rag).{0,20}(?:和|与|加上).{0,8}(?:通用|常识|general)/i
    .test(query)
}

function hasStructuredProtectedTerm(debug: KnowledgeSearchDebugInfo | null): boolean {
  return (debug?.protectedTerms ?? []).some((term) =>
    /[a-z]/i.test(term) && /\d/.test(term)
  )
}

async function* staticAnswerStream(answer: string): AsyncGenerator<KnowledgeQaDeltaEvent> {
  yield { type: 'answer_delta', delta: answer }
}


