import type { KnowledgeSearchHit } from 'share-type'

const STEP_OPEN_TAG = '<koreai_reasoning_step>'
const STAGE_KEY_OPEN_TAG = '<koreai_stage_key>'
const STAGE_KEY_CLOSE_TAG = '</koreai_stage_key>'
const TITLE_OPEN_TAG = '<koreai_title>'
const TITLE_CLOSE_TAG = '</koreai_title>'
const SUBTITLE_OPEN_TAG = '<koreai_subtitle>'
const SUBTITLE_CLOSE_TAG = '</koreai_subtitle>'
const CONTENT_OPEN_TAG = '<koreai_content>'
const CONTENT_CLOSE_TAG = '</koreai_content>'
const FINAL_ANSWER_OPEN_TAG = '<koreai_final_answer>'
const FINAL_ANSWER_CLOSE_TAG = '</koreai_final_answer>'

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
    'Return the answer with the exact custom tag protocol requested by the user prompt.',
    'Do not add Markdown fences, explanations about the format, or any extra prose outside the required tags.'
  ].join('\n')
}

//声明流式知识问答用户提示词构造器
export function buildKnowledgeQaStreamingUserPrompt(
  query: string,
  hits: KnowledgeSearchHit[],
  includeReasoning: boolean
): string {
  const context = buildKnowledgeQaContext(hits) || '(no knowledge excerpts found)'

  //声明普通模式只输出最终答案标签
  if (!includeReasoning) {
    return [
      `User question:\n${query}`,
      `Knowledge excerpts:\n${context}`,
      'Return only the final answer tag protocol below:',
      `${FINAL_ANSWER_OPEN_TAG}final answer${FINAL_ANSWER_CLOSE_TAG}`,
      'Rules:',
      '- Match the language of the user question.',
      '- Do not include any text outside the final answer tag.'
    ].join('\n\n')
  }

  //声明思考模式输出推理标签块加最终答案标签
  return [
    `User question:\n${query}`,
    `Knowledge excerpts:\n${context}`,
    'Return only the following tag protocol, in this exact order:',
    STEP_OPEN_TAG,
    `${STAGE_KEY_OPEN_TAG}deepsearch|llm_reasoning|web_search${STAGE_KEY_CLOSE_TAG}`,
    `${TITLE_OPEN_TAG}short title${TITLE_CLOSE_TAG}`,
    `${SUBTITLE_OPEN_TAG}short subtitle${SUBTITLE_CLOSE_TAG}`,
    `${CONTENT_OPEN_TAG}display-safe reasoning summary${CONTENT_CLOSE_TAG}`,
    'Repeat the reasoning-step block 2 to 4 times before the final answer.',
    `${FINAL_ANSWER_OPEN_TAG}final answer${FINAL_ANSWER_CLOSE_TAG}`,
    'Rules:',
    '- The reasoning blocks must be concise, user-visible summaries, not raw hidden chain-of-thought.',
    '- Keep the titles short and readable.',
    '- Keep the subtitle short and specific.',
    '- Use stageKey "deepsearch" when narrowing the problem, "llm_reasoning" when synthesizing, and "web_search" only if web search actually happened.',
    '- Match the language of the user question.',
    '- Do not include any tags other than the ones defined above.'
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
