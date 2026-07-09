import type { KnowledgeSearchHit } from "share-type";
import type { KnowledgeRetrievalCandidate } from "./knowledge-retrieval.types";

const RRF_K = 60;
const DEFAULT_BM25_BRANCH_WEIGHT = 1;
const DEFAULT_VECTOR_BRANCH_WEIGHT = 1;

type MergeOptions = {
  bm25Weight?: number
  vectorWeight?: number
}

type MergedCandidate = KnowledgeRetrievalCandidate & {
  fusedScore: number;
};
//混合召回分数展现和排序
export function mergeKnowledgeRetrievalCandidates(
  bm25Candidates: KnowledgeRetrievalCandidate[],
  vectorCandidates: KnowledgeRetrievalCandidate[],
  limit: number,
  options:MergeOptions = {}
): KnowledgeSearchHit[] {
  const bm25Weight = normalizeWeight(options?.bm25Weight,DEFAULT_BM25_BRANCH_WEIGHT)
  const vectorWeight = normalizeWeight(options?.vectorWeight,DEFAULT_VECTOR_BRANCH_WEIGHT)
  const maxFusedScore = bm25Weight/(RRF_K+1) + vectorWeight/(RRF_K+1)

  const merged = new Map<string, MergedCandidate>();

  addBranchScores(merged, bm25Candidates, "bm25", bm25Weight);
  addBranchScores(merged, vectorCandidates, "vector", vectorWeight);
  

  return Array.from(merged.values())
    .sort(compareMergedCandidates)
    .slice(0, limit)
    .map((item) => formatToSearchHit(item, maxFusedScore))
}
//排序工具
function compareMergedCandidates(left: MergedCandidate, right: MergedCandidate): number {
    //按照混合rrf的排分整体降序排序
    if (right.fusedScore !== left.fusedScore) {
      return right.fusedScore - left.fusedScore;
    }
    //按照bm25原始分数排序
    const rightBm25 = right.bm25Score ?? -1;
    const leftBm25 = left.bm25Score ?? -1;
    if (rightBm25 !== leftBm25) {
      return rightBm25 - leftBm25;
    }
    //按照向量相似度分数降序
    const rightVector = right.vectorScore ?? -1;
    const leftVector = left.vectorScore ?? -1;
    return rightVector - leftVector;
}
//多路召回RRF加权融合工具
function addBranchScores(
  merged: Map<string, MergedCandidate>,
  items: KnowledgeRetrievalCandidate[],
  branch: "bm25" | "vector",
  weight: number,
) {
  items.forEach((item, index) => {
    const rank = index + 1;
    const branchScore = weight / (RRF_K + rank);
    const current = merged.get(item.chunkId);
    if (!current) {
      merged.set(item.chunkId, {
        ...item,
        fusedScore: branchScore,
      });
      return;
    }
    //chunk已经存在 叠加二次命中分数
    current.fusedScore += branchScore;
    //保留原数据的支路分数
    if (branch === "bm25") {
      current.bm25Score = item.bm25Score;
      current.bm25Rank = item.bm25Rank;
    }
    if (branch === "vector") {
      current.vectorScore = item.vectorScore;
      current.vectorRank = item.vectorRank;
    }
    if (!current.matchedBy.includes(branch)) {
      current.matchedBy.push(branch);
    }
  });
}
//格式化工具
function formatToSearchHit(
  item: MergedCandidate,
  maxFusedScore: number
): KnowledgeSearchHit {
  // 将原始0~maxFusedScore的小数，换算成0~100展示分，保留两位小数
  const score =
    maxFusedScore > 0
      ? Number(((item.fusedScore / maxFusedScore) * 100).toFixed(2))
      : 0

  return {
    chunkId: item.chunkId,
    documentId: item.documentId,
    documentName: item.documentName,
    content: item.content,
    score, // 对外展示的0-100匹配度分数
    scoreDetail: {
      matchedBy: item.matchedBy,
      bm25Score: item.bm25Score,
      vectorScore: item.vectorScore,
      fusedScore: Number(item.fusedScore.toFixed(8)) // 原始融合小数分，用于调试
    }
  }
}
function normalizeWeight(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(value, 0.2), 2)
}