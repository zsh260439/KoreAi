import type { KnowledgeSearchHit } from 'share-type'

//声明流式知识问答系统提示词构造器
export function buildKnowledgeQaStreamingSystemPrompt(
  hasKnowledge: boolean,
  evidenceGateStatus: 'pass' | 'degraded' | 'blocked' = 'pass'
): string {
  const baseInstructions = hasKnowledge
    ? [
        'You are a professional question-answering assistant.',
        'Use the provided knowledge-base excerpts as the primary source of truth.',
        'Do not supplement missing knowledge-base facts with general knowledge.',
        'If a required fact is not present in the excerpts, explicitly say that the evidence is missing.',
        'Every concrete number, identifier, role, threshold, rule, or conclusion must be grounded in the excerpts.',
        'Match the language of the user question.'
      ]
    : [
        'You are a professional question-answering assistant.',
        'No relevant knowledge-base excerpts are available for this request.',
        'Answer with general knowledge and explicitly state that the answer is not grounded in the knowledge base.',
        'Match the language of the user question.'
      ]

  if (evidenceGateStatus === 'degraded') {
    baseInstructions.push(
      'Evidence coverage is incomplete. Answer conservatively and mark missing details instead of guessing.'
    )
  }

  return baseInstructions.join('\n')
}

//声明流式知识问答用户提示词构造器
export function buildKnowledgeQaStreamingUserPrompt(
  query: string,
  hits: KnowledgeSearchHit[],
  includeReasoning: boolean,
  evidence: {
    evidenceGateStatus?: 'pass' | 'degraded' | 'blocked'
    evidenceCoverage?: number
  } = {}
): string {
  const context = buildKnowledgeQaContext(hits) || '(no knowledge excerpts found)'
  const evidencePolicy = [
    `Evidence gate status: ${evidence.evidenceGateStatus ?? 'pass'}`,
    `Evidence coverage: ${typeof evidence.evidenceCoverage === 'number' ? evidence.evidenceCoverage : 'unknown'}`,
    'Answering rules:',
    '- Use only the knowledge excerpts above for factual claims.',
    '- If the excerpts do not contain a requested fact, say that the fact is not found in the retrieved evidence.',
    '- Do not infer exact numbers, dates, roles, thresholds, or identifiers from similar documents.',
    '- For multi-fact questions, answer item by item and only include items that are supported by evidence.'
  ].join('\n')

  if (!includeReasoning) {
    return [
      `User question:\n${query}`,
      `Knowledge excerpts:\n${context}`,
      evidencePolicy,
      'Return only the final answer.',
      'Do not include any extra wrapper markers.'
    ].join('\n\n')
  }

  return [
    `User question:\n${query}`,
    `Knowledge excerpts:\n${context}`,
    evidencePolicy,
    'Return exactly two markdown sections in order.',
    'Section 1 heading must be exactly: ## Thinking',
    'Section 2 heading must be exactly: ## Answer',
    'Rules:',
    '- Start with ## Thinking and put the visible reasoning summary under it.',
    '- Then output ## Answer on its own line and put the final answer under it.',
    '- The visible reasoning summary should be natural, concise, and useful for understanding how the answer was formed.',
    '- Do not expose raw hidden chain-of-thought.',
    '- Keep the visible reasoning summary focused on observable work such as what the user is asking, what evidence matters, what is missing, and how the answer will be framed.',
    '- Do not use a canned review template or repeated rubric.',
    '- Explicitly avoid fixed labels such as "问题边界", "证据定位", "风险与缺口", "回答策略" unless the user explicitly asks for that exact structure.',
    '- If you use bullets or mini-headings, make them specific to the current question and let them vary naturally from one query to another.',
    '- For simple questions, 1 to 3 short lines are enough. For complex questions, use a few natural notes or short paragraphs.',
    '- Do not output any extra headings or wrapper markers.',
    '- Match the language of the user question.'
  ].join('\n\n')
}

//声明知识问答上下文文本构造器
function buildKnowledgeQaContext(hits: KnowledgeSearchHit[]): string {
  return hits
    .map(
      (item, index) => `[${index + 1}]
documentId: ${item.documentId}
documentName: ${item.documentName}
content: ${item.content}`
    )
    .join('\n\n')
}
