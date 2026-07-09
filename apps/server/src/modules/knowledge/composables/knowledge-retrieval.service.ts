import { Injectable } from '@nestjs/common'
import type { KnowledgeSearchDebugInfo, KnowledgeSearchHit, KnowledgeSearchResponse } from 'share-type'
import { KnowledgeVectorStoreService } from './knowledge-vector-store.service'
import { KnowledgeBm25Service } from './knowledge-bm25.service'
import { mergeKnowledgeRetrievalCandidates } from './knowledge-hybrid-ranker'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'
import { KnowledgeQueryEngineService } from './knowledge-query-engine.service'

const MIN_CANDIDATE_LIMIT = 20
const MAX_CANDIDATE_LIMIT = 80
const CANDIDATE_MULTIPLIER = 4 

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeBm25Service: KnowledgeBm25Service,
    private readonly knowledgeQueryEngineService: KnowledgeQueryEngineService,
  ) {}
  
  async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK:number,
    options: { enableRewrite?: boolean } = {}
  ) :Promise<KnowledgeSearchResponse>{
    const candidateLimit = resolveCandidateLimit(topK)
    // 先把 query 变成统一的检索计划，后面两路都只依赖这个计划，不再各自猜测
    const plan = await this.knowledgeQueryEngineService.buildPlan(query, {
      enableAnalysis: options.enableRewrite !== false
    })

    // BM25 和向量召回并行执行，避免 query rewrite 打开后把总延迟进一步拉长
    const [bm25Candidates,vectorCandidates] = await Promise.all([
        this.knowledgeBm25Service.search(plan.bm25Query,knowledgeBaseId,candidateLimit),
        this.vectorRecall(plan.vectorQuery,knowledgeBaseId,candidateLimit)
    ])

    // 命中列表只按固定 1:1 融合，保证同一个 query 的展示分可解释、可复现
    const hits = mergeKnowledgeRetrievalCandidates(
      bm25Candidates,
      vectorCandidates,
      topK,
      {
        bm25Weight: plan.retrieval.bm25Weight,
        vectorWeight: plan.retrieval.vectorWeight,
      }
    )

    // 这份 debug 只描述“本次检索发生了什么”，不参与排序本身
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
    query:string,
    knowledgeBaseId:string|undefined,
    limit:number
  ):Promise<KnowledgeRetrievalCandidate[]>{
    const result =  await this.knowledgeVectorStoreService.similaritySearchWithScore(query,limit,knowledgeBaseId)

    // 这里保留向量原始相似度和 rank，前端可以直接看出“是不是只有 vector 生效”
    return result.map(([doc,score],index)=>({
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

function resolveCandidateLimit(topK: number): number {
  // topK 是返回给用户看的条数，候选集需要更宽一些，否则 RRF 没有融合空间
  const scaled = Math.max(1, Math.floor(topK)) * CANDIDATE_MULTIPLIER
  return Math.min(Math.max(scaled, MIN_CANDIDATE_LIMIT), MAX_CANDIDATE_LIMIT)
}
