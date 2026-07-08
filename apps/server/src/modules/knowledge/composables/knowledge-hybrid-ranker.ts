import type { KnowledgeSearchHit } from "share-type";
import type { KnowledgeRetrievalCandidate } from "./knowledge-retrieval.types";

const RRF_K = 60;
const BM25_BRANCH_WEIGHT = 1.15;
const VECTOR_BRANCH_WEIGHT = 1;
const MAX_FUSED_SCORE =
  BM25_BRANCH_WEIGHT / (RRF_K + 1) + VECTOR_BRANCH_WEIGHT / (RRF_K + 1);

type MergedCandidate = KnowledgeRetrievalCandidate & {
  fusedScore: number;
};
//混合召回分数展现和排序
export function mergeKnowledgeRetrievalCandidates(
  bm25Candidates: KnowledgeRetrievalCandidate[],
  vectorCandidates: KnowledgeRetrievalCandidate[],
  limit: number,
): KnowledgeSearchHit[] {
  const merged = new Map<string, MergedCandidate>();
  addBranchScores(merged, bm25Candidates, "bm25", BM25_BRANCH_WEIGHT);
  addBranchScores(merged, vectorCandidates, "vector", VECTOR_BRANCH_WEIGHT);
  //map转换为数组排序
  const allCandidates = Array.from(merged.values())
  //排序
  const sortedCandidates = sortCandidates(allCandidates)
  //截取前limit个
   const topCandidates = sortedCandidates.slice(0, limit)
   //格式化
   return topCandidates.map(formatToSearchHit)
}
//排序工具
function sortCandidates(list: MergedCandidate[]): MergedCandidate[] {
  return list.sort((left, right) => {
    //按照混合rrf的排分整体降序排序
    if (right.fusedScore !== left.fusedScore) {
      return right.fusedScore - left.fusedScore;
    }
    //按照bm25原始分数排序
    const rightBm25 = right.bm25Score || -1;
    const leftBm25 = left.bm25Score || -1;
    if (rightBm25 !== leftBm25) {
      return rightBm25 - leftBm25;
    }
    //按照向量相似度分数降序
    const rightVector = right.vectorScore ?? -1;
    const leftVector = left.vectorScore ?? -1;
    return rightVector - leftVector;
  });
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
function formatToSearchHit(item: MergedCandidate): KnowledgeSearchHit {
  const percentScore = Number(((item.fusedScore / MAX_FUSED_SCORE) * 100).toFixed(2))
  const fixedFusedScore = Number(item.fusedScore.toFixed(8))

  return {
    chunkId: item.chunkId,
    documentId: item.documentId,
    documentName: item.documentName,
    content: item.content,
    score: percentScore,
    scoreDetail: {
      matchedBy: item.matchedBy,
      bm25Score: item.bm25Score,
      vectorScore: item.vectorScore,
      fusedScore: fixedFusedScore
    }
  }
}
