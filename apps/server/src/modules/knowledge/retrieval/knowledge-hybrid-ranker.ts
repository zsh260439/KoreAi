import type { KnowledgeSearchHit } from 'share-type'
import type { KnowledgeRetrievalCandidate } from './knowledge-retrieval.types'

const RRF_K = 60
const DEFAULT_BRANCH_WEIGHT = 1

type MergeOptions = {
  bm25Weight?: number
  vectorWeight?: number
}

type MergedCandidate = KnowledgeRetrievalCandidate & {
  fusedScore: number
}

export function mergeKnowledgeRetrievalCandidates(
  bm25Candidates: KnowledgeRetrievalCandidate[],
  vectorCandidates: KnowledgeRetrievalCandidate[],
  limit: number,
  options: MergeOptions = {}
): KnowledgeSearchHit[] {
  const bm25Weight = normalizeWeight(options.bm25Weight)
  const vectorWeight = normalizeWeight(options.vectorWeight)
  const maxFusedScore = (bm25Weight + vectorWeight) / (RRF_K + 1)
  const merged = new Map<string, MergedCandidate>()

  addBranchScores(merged, bm25Candidates, 'bm25', bm25Weight)
  addBranchScores(merged, vectorCandidates, 'vector', vectorWeight)

  return [...merged.values()]
    .sort(compareCandidates)
    .slice(0, limit)
    .map((candidate) => toSearchHit(candidate, maxFusedScore))
}

function addBranchScores(
  merged: Map<string, MergedCandidate>,
  candidates: KnowledgeRetrievalCandidate[],
  branch: 'bm25' | 'vector',
  weight: number
): void {
  candidates.forEach((candidate, index) => {
    const current = merged.get(candidate.chunkId)
    const branchScore = weight / (RRF_K + index + 1)
    if (!current) {
      merged.set(candidate.chunkId, {
        ...candidate,
        matchedBy: [...candidate.matchedBy],
        fusedScore: branchScore
      })
      return
    }

    current.fusedScore += branchScore
    if (branch === 'bm25') {
      current.bm25Score = candidate.bm25Score
      current.bm25Rank = candidate.bm25Rank
    } else {
      current.vectorScore = candidate.vectorScore
      current.vectorRank = candidate.vectorRank
    }
    if (!current.matchedBy.includes(branch)) {
      current.matchedBy.push(branch)
    }
  })
}

function compareCandidates(left: MergedCandidate, right: MergedCandidate): number {
  return (
    right.fusedScore - left.fusedScore ||
    (right.bm25Score ?? -1) - (left.bm25Score ?? -1) ||
    (right.vectorScore ?? -1) - (left.vectorScore ?? -1)
  )
}

function toSearchHit(candidate: MergedCandidate, maxFusedScore: number): KnowledgeSearchHit {
  const score = maxFusedScore
    ? Number(((candidate.fusedScore / maxFusedScore) * 100).toFixed(2))
    : 0

  return {
    chunkId: candidate.chunkId,
    documentId: candidate.documentId,
    documentName: candidate.documentName,
    sequence: candidate.sequence,
    sectionPath: candidate.sectionPath,
    primaryTitle: candidate.primaryTitle,
    content: candidate.content,
    score,
    scoreDetail: {
      matchedBy: candidate.matchedBy,
      bm25Score: candidate.bm25Score,
      vectorScore: candidate.vectorScore,
      fusedScore: Number(candidate.fusedScore.toFixed(8))
    }
  }
}

function normalizeWeight(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.min(Math.max(value ?? DEFAULT_BRANCH_WEIGHT, 0.2), 2)
    : DEFAULT_BRANCH_WEIGHT
}
