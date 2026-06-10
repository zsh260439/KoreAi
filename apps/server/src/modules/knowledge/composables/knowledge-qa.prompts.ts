import type { KnowledgeSearchHit } from 'share-type'

//声明最终答案分隔标记
export const FINAL_ANSWER_MARKER = '<koreai_final_answer>'

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

  return [
    ...baseInstructions,
    `When the user enables thinking mode, stream a concise visible reasoning summary first, then output ${FINAL_ANSWER_MARKER} on its own line, then output the final answer.`,
    `Do not use any XML tags or wrapper markers other than ${FINAL_ANSWER_MARKER}.`,
    'Do not include hidden chain-of-thought or policy text.'
  ].join('\n')
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
    'Output format:',
    '1. First output a concise visible reasoning summary in plain text for the user.',
    `2. Then output this exact separator on a new line: ${FINAL_ANSWER_MARKER}`,
    '3. Then output the final answer in plain text.',
    'Rules:',
    '- Start the visible reasoning summary immediately instead of waiting for the whole answer.',
    '- The visible reasoning summary must be concise and safe for display.',
    '- Do not expose raw hidden chain-of-thought.',
    '- Keep the visible reasoning summary focused on how you are approaching the answer.',
    `- Never output protocol leftovers such as ${FINAL_ANSWER_MARKER}, </koreai_final_answer>, <koreai_finish> or </koreai_finish> in the final answer.`,
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
