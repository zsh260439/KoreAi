import { Injectable } from '@nestjs/common'
import type { KnowledgeSearchHit } from 'share-type'
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
  ) :Promise<KnowledgeSearchHit[]>{
    const candidateLimit = resolveCandidateLimit(topK)
    const plan = await this.knowledgeQueryEngineService.buildPlan(query, {
      enableAnalysis: options.enableRewrite !== false
    })
    const [bm25Candidates,vectorCandidates] = await Promise.all([
        this.knowledgeBm25Service.search(plan.bm25Query,knowledgeBaseId,candidateLimit),
        this.vectorRecall(plan.vectorQuery,knowledgeBaseId,candidateLimit)
    ])
    return mergeKnowledgeRetrievalCandidates(bm25Candidates,vectorCandidates,topK,
      {
        bm25Weight: plan.retrieval.bm25Weight,
        vectorWeight: plan.retrieval.vectorWeight,
      }
    )
  }
  
  private async vectorRecall(
    query:string,
    knowledgeBaseId:string|undefined,
    limit:number
  ):Promise<KnowledgeRetrievalCandidate[]>{
    const result =  await this.knowledgeVectorStoreService.similaritySearchWithScore(query,limit,knowledgeBaseId)

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
  const scaled = Math.max(1, Math.floor(topK)) * CANDIDATE_MULTIPLIER
  return Math.min(Math.max(scaled, MIN_CANDIDATE_LIMIT), MAX_CANDIDATE_LIMIT)
}
