import type { KnowledgeRetrievalSource } from 'share-type'

export type KnowledgeRetrievalCandidate = {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  sequence: number | null
  sectionPath: string | null
  primaryTitle: string | null
  bm25Score: number | null
  vectorScore: number | null
  bm25Rank: number | null
  vectorRank: number | null
  matchedBy: KnowledgeRetrievalSource[]
}


