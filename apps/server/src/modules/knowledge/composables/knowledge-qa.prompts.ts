import type { KnowledgeSearchHit } from 'share-type'

//声明流式知识问答系统提示词构造器
export function buildKnowledgeQaStreamingSystemPrompt(hasKnowledge: boolean): string {
  const baseInstructions = hasKnowledge
    ? [
        'You are a professional question-answering assistant.',
        'Use the provided knowledge-base excerpts as the primary source of truth.',
        'If the knowledge base is incomplete, you may supplement with general knowledge, but clearly distinguish knowledge-base facts from general knowledge.',
        'Match the language of the user question.'
      ]
    : [
        'You are a professional question-answering assistant.',
        'No relevant knowledge-base excerpts are available for this request.',
        'Answer with general knowledge and explicitly state that the answer is not grounded in the knowledge base.',
        'Match the language of the user question.'
      ]

  return baseInstructions.join('\n')
}

//声明流式知识问答用户提示词构造器
export function buildKnowledgeQaStreamingUserPrompt(
  query: string,
  hits: KnowledgeSearchHit[],
  includeReasoning: boolean
): string {
  const context = buildKnowledgeQaContext(hits) || '(no knowledge excerpts found)'

  if (!includeReasoning) {
    return [
      `User question:\n${query}`,
      `Knowledge excerpts:\n${context}`,
      'Return only the final answer.',
      'Do not include any extra wrapper markers.'
    ].join('\n\n')
  }

  return [
    `User question:\n${query}`,
    `Knowledge excerpts:\n${context}`,
    'Return exactly two markdown sections in order.',
    'Section 1 heading must be exactly: ## Thinking',
    'Section 2 heading must be exactly: ## Answer',
    'Rules:',
    '- Start with ## Thinking and put the visible reasoning summary under it.',
    '- Then output ## Answer on its own line and put the final answer under it.',
    '- The visible reasoning summary should be natural, concise, and useful for understanding how the answer was formed.',
    '- Do not expose raw hidden chain-of-thought.',
    '- Keep the visible reasoning summary focused on observable work such as question scope, relevant evidence, missing or weak evidence, and answer strategy.',
    '- You may use short notes, bullet points, or brief paragraphs. Do not force a fixed analysis template unless the user explicitly asks for one.',
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
