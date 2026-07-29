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
import { buildCompleteDeterministicFieldAnswer } from '../answer-generation/knowledge-qa-answer-validation'

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
      || dto.generalKnowledgeOnly === true

    if (retrievalResult.debug?.evidenceGateStatus === 'blocked') {
      if (shouldUseEvidenceBackedDegradedAnswer(query, sources, retrievalResult.debug)) {
        const answer = await this.qaService.streamAnswerQuestion(query, sources, {
          includeReasoning: dto.think,
          signal: options.signal,
          temperature: runtimeConfig.answer.temperature,
          evidenceGateStatus: 'degraded',
          scopeCoverage: retrievalResult.debug.scopeCoverage,
          factCoverage: retrievalResult.debug.factCoverage,
          retrievalDebug: retrievalResult.debug,
          allowGeneralKnowledge: false
        })

        return {
          sources,
          retrievalDebug: {
            ...retrievalResult.debug,
            evidenceGateStatus: 'degraded'
          },
          model: await this.qaService.getModelName(),
          totalTokens: answer.totalTokens,
          stream: answer.stream
        }
      }

      if (allowGeneralKnowledge) {
        const answer = await this.qaService.streamAnswerQuestion(query, sources, {
          includeReasoning: dto.think,
          signal: options.signal,
          temperature: runtimeConfig.answer.temperature,
          evidenceGateStatus: 'degraded',
          scopeCoverage: retrievalResult.debug.scopeCoverage,
          factCoverage: retrievalResult.debug.factCoverage,
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
          scopeCoverage: retrievalResult.debug.scopeCoverage,
          factCoverage: retrievalResult.debug.factCoverage,
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

    const deterministicAnswer = buildDeterministicAnswerIfComplete(
      query,
      sources,
      retrievalResult.debug
    )
    if (deterministicAnswer) {
      return {
        sources,
        retrievalDebug: retrievalResult.debug,
        model: null,
        totalTokens: Promise.resolve(0),
        stream: staticAnswerStream(deterministicAnswer)
      }
    }

    const answer = await this.qaService.streamAnswerQuestion(query, sources, {
      includeReasoning: dto.think,
      signal: options.signal,
      temperature: runtimeConfig.answer.temperature,
      evidenceGateStatus: retrievalResult.debug?.evidenceGateStatus,
      scopeCoverage: retrievalResult.debug?.scopeCoverage,
      factCoverage: retrievalResult.debug?.factCoverage,
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
  if (debug?.ragAnswerMode === 'general' || debug?.ragAnswerMode === 'mixed') {
    return true
  }

  if (debug?.ragRetrievalMode === 'semantic') {
    return true
  }

  if (debug?.ragScopeMode?.startsWith('explicit')) {
    return false
  }

  return /学习|新手|介绍|解释|原理|教程|怎么用|如何使用|是什么|区别|入门|概念|redis|database|cache/i.test(query)
}

function shouldAllowMixedKnowledgeAnswer(query: string): boolean {
  return /(?:结合|整合|综合).{0,12}(?:本地|知识库|rag).{0,20}(?:通用|常识|general)|(?:本地|知识库|rag).{0,20}(?:和|与|加上).{0,8}(?:通用|常识|general)/i
    .test(query)
}

function shouldUseEvidenceBackedDegradedAnswer(
  query: string,
  sources: KnowledgeSearchHit[],
  debug: KnowledgeSearchDebugInfo
): boolean {
  if (sources.length === 0 || (debug.scopeCoverage ?? 0) < 1) {
    return false
  }

  if ((debug.evidenceFieldSlots ?? []).length > 0) {
    return false
  }

  if (debug.ragScopeMode === 'needs_clarification') {
    return false
  }

  return /(?:描述|说明|总结|归档模式|通用归档|共性|共同点|差异|对比|比较|流程|步骤|方式|策略|原因|为什么|如何|怎么办|describe|summary|summarize|compare|procedure|pattern|strategy|why|how)/i
    .test(query)
}

function buildDeterministicAnswerIfComplete(
  query: string,
  sources: KnowledgeSearchHit[],
  debug: KnowledgeSearchDebugInfo | null
): string {
  if (
    debug?.evidenceGateStatus !== 'pass' ||
    debug.ragAnswerMode !== 'rag' ||
    debug.ragUserIntent !== 'fact_lookup'
  ) {
    return ''
  }

  const fieldSlots = debug.evidenceFieldSlots ?? []
  if (fieldSlots.length === 0) {
    return ''
  }

  const scopedSources = filterSourcesByScope(sources, debug.retrievalScopeObjects?.map((item) => item.value) ?? [])
  return buildCompleteDeterministicFieldAnswer(query, scopedSources, fieldSlots)?.answer ?? ''
}

function filterSourcesByScope(
  sources: KnowledgeSearchHit[],
  scopeObjects: string[]
): KnowledgeSearchHit[] {
  const normalizedScopes = scopeObjects.map(normalizeScopeText).filter((item) => item.length >= 3)
  if (normalizedScopes.length === 0) {
    return sources
  }

  const scopedSources = sources.filter((source) => {
    const searchable = normalizeScopeText([
      source.documentName,
      source.primaryTitle,
      source.sectionPath,
      source.content
    ].filter(Boolean).join(' '))
    return normalizedScopes.some((scope) => searchable.includes(scope))
  })

  return scopedSources.length > 0 ? scopedSources : sources
}

function normalizeScopeText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

async function* staticAnswerStream(answer: string): AsyncGenerator<KnowledgeQaDeltaEvent> {
  yield { type: 'answer_delta', delta: answer }
}


