import { Injectable } from '@nestjs/common'
import type { KnowledgeSearchHit } from 'share-type'
import { KnowledgeVectorStoreService } from './knowledge-vector-store.service'
import { KnowledgeBm25Service } from './knowledge-bm25.service'
import { mergeKnowledgeRetrievalCandidates } from './knowledge-hybrid-ranker'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'

const MIN_CANDIDATE_LIMIT = 20
const MAX_CANDIDATE_LIMIT = 80
const CANDIDATE_MULTIPLIER = 4 
@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private readonly knowledgeVectorStoreService: KnowledgeVectorStoreService,
    private readonly knowledgeBm25Service: KnowledgeBm25Service,
  ) {}
  
  async retrieveKnowledge(
    knowledgeBaseId: string | undefined,
    query: string,
    topK:number
  ) :Promise<KnowledgeSearchHit[]>{
    const candidateLimit = resolveCandidateLimit(topK)

    const [bm25Candidates,vectorCandidates] = await Promise.all([
        this.knowledgeBm25Service.search(query,knowledgeBaseId,candidateLimit),
        this.vectorRecall(query,knowledgeBaseId,candidateLimit)
    ])
    return mergeKnowledgeRetrievalCandidates(bm25Candidates,vectorCandidates,topK)
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