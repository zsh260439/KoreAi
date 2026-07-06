import type { KnowledgeSearchHit } from 'share-type'
import { KNOWLEDGE_QA_ANSWER_TAG, KNOWLEDGE_QA_THINK_TAG } from './knowledge-qa.parser'

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

  const thinkOpenTag = `<${KNOWLEDGE_QA_THINK_TAG}>`
  const thinkCloseTag = `</${KNOWLEDGE_QA_THINK_TAG}>`
  const answerOpenTag = `<${KNOWLEDGE_QA_ANSWER_TAG}>`
  const answerCloseTag = `</${KNOWLEDGE_QA_ANSWER_TAG}>`

  return [
    ...baseInstructions,
    `When the user enables thinking mode, you must output exactly two XML sections in order: ${thinkOpenTag}enterprise-grade visible reasoning summary${thinkCloseTag}${answerOpenTag}final answer${answerCloseTag}.`,
    `Do not use any XML tags or wrapper markers other than ${thinkOpenTag}, ${thinkCloseTag}, ${answerOpenTag}, and ${answerCloseTag}.`,
    'Do not nest or reorder these tags.',
    'If the content contains special characters such as <, >, or &, escape them as &lt;, &gt;, and &amp;.',
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
    `1. First open <${KNOWLEDGE_QA_THINK_TAG}> and stream an enterprise-grade visible reasoning summary.`,
    `2. Then close </${KNOWLEDGE_QA_THINK_TAG}> and open <${KNOWLEDGE_QA_ANSWER_TAG}>.`,
    `3. Then stream the final answer and close </${KNOWLEDGE_QA_ANSWER_TAG}>.`,
    'Rules:',
    '- Start the visible reasoning summary immediately instead of waiting for the whole answer.',
    '- The visible reasoning summary should be detailed enough for an enterprise user to trust the process, usually 4-8 short lines when evidence is available.',
    '- Do not expose raw hidden chain-of-thought.',
    '- Keep the visible reasoning summary focused on observable work: question scope, relevant evidence, missing or weak evidence, and answer strategy.',
    '- Prefer compact section-like lines such as "问题边界：...", "证据定位：...", "风险与缺口：...", "回答策略：..." when the user asks in Chinese.',
    `- Use only <${KNOWLEDGE_QA_THINK_TAG}> and <${KNOWLEDGE_QA_ANSWER_TAG}> as wrapper tags.`,
    '- Do not output any text outside these two tag sections.',
    '- Do not nest tags or output the answer before the think section is closed.',
    '- Escape special characters in content: < as &lt;, > as &gt;, & as &amp;.',
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
