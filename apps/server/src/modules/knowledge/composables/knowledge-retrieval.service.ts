import { Injectable } from '@nestjs/common'
import type {
  KnowledgeBaseRuntimeConfig,
  KnowledgeSearchDebugInfo,
  KnowledgeSearchResponse
} from 'share-type'

import { KnowledgeBm25Service } from './knowledge-bm25.service'
import { mergeKnowledgeRetrievalCandidates } from './knowledge-hybrid-ranker'
import { KnowledgeQueryEngineService } from './knowledge-query-engine.service'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'
import { KnowledgeVectorStoreService } from './knowledge-vector-store.service'

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeBm25Service: KnowledgeBm25Service,
    private readonly knowledgeQueryEngineService: KnowledgeQueryEngineService
  ) {}

  async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK: number,
    options: {
      enableRewrite?: boolean
      runtimeConfig: KnowledgeBaseRuntimeConfig
    }
  ): Promise<KnowledgeSearchResponse> {
    const candidateLimit = resolveCandidateLimit(topK, options.runtimeConfig)
    // 先把 query 变成统一的检索计划，后面两路都只依赖这份计划。
    const plan = await this.knowledgeQueryEngineService.buildPlan(query, {
      enableAnalysis:
        options.enableRewrite !== false && options.runtimeConfig.retrieval.queryAnalysisEnabled,
      runtimeConfig: options.runtimeConfig
    })

    // BM25 和向量召回并行执行，避免打开 rewrite 后明显拉长总耗时。
    const [bm25Candidates, vectorCandidates] = await Promise.all([
      this.knowledgeBm25Service.search(plan.bm25Query, knowledgeBaseId, candidateLimit),
      this.vectorRecall(plan.vectorQuery, knowledgeBaseId, candidateLimit)
    ])

    // 命中列表只吃 admin 显式配置的权重，避免 LLM rewrite 偷改融合策略。
    const hits = mergeKnowledgeRetrievalCandidates(bm25Candidates, vectorCandidates, topK, {
      bm25Weight: plan.retrieval.bm25Weight,
      vectorWeight: plan.retrieval.vectorWeight
    })

    // debug 只描述这次检索发生了什么，不参与排序本身。
    const debug: KnowledgeSearchDebugInfo = {
      originalQuery: plan.originalQuery,
      normalizedQuery: plan.normalizedQuery,
      bm25Query: plan.bm25Query,
      vectorQuery: plan.vectorQuery,
      rewriteApplied: plan.rewriteApplied,
      retrievalMode: plan.retrieval.mode,
      bm25Weight: plan.retrieval.bm25Weight,
      vectorWeight: plan.retrieval.vectorWeight,
      bm25HitCount: bm25Candidates.length,
      vectorHitCount: vectorCandidates.length
    }

    return {
      hits,
      debug
    }
  }

  private async vectorRecall(
    query: string,
    knowledgeBaseId: string | undefined,
    limit: number
  ): Promise<KnowledgeRetrievalCandidate[]> {
    const result = await this.knowledgeVectorStoreService.similaritySearchWithScore(
      query,
      limit,
      knowledgeBaseId
    )

    // 保留向量原始相似度和 rank，前端才能看出是否只有 vector 生效。
    return result.map(([doc, score], index) => ({
      chunkId: doc.id ?? '',
      documentId: String(doc.metadata.documentId ?? ''),
      documentName: String(doc.metadata.documentName ?? ''),
      content: doc.pageContent,
      bm25Score: null,
      vectorScore: Number((score * 100).toFixed(4)),
      bm25Rank: null,
      vectorRank: index + 1,
      matchedBy: ['vector']
    }))
  }
}

function resolveCandidateLimit(topK: number, runtimeConfig: KnowledgeBaseRuntimeConfig): number {
  // topK 是返回给用户看的条数，候选集需要更宽一些，否则融合没有空间。
  const scaled = Math.max(1, Math.floor(topK)) * runtimeConfig.retrieval.candidateMultiplier

  return Math.min(
    Math.max(scaled, runtimeConfig.retrieval.minCandidateLimit),
    runtimeConfig.retrieval.maxCandidateLimit
  )
}
