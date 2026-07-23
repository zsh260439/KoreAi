import type { KnowledgeSearchHit } from 'share-type'
import type { KnowledgeEvidenceFact } from '../evidence-gating/knowledge-evidence-fact-extractor'

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
        'Text extracted from OCR, VLM, images, attachments, dashboards, or tables is valid evidence once it appears in the excerpts.',
        'A sentence saying a value is stored in an image or attachment describes the source carrier; it does not mean the extracted value is missing.',
        'When a machine-readable identifier directly answers a requested item, copy it verbatim; a descriptive paraphrase does not replace the identifier.',
        'Answer only the requested fields. Do not add neighboring values, source indexes, citations, or extra caveats unless the user asks for them.',
        'For old/new or before/after configuration questions, each time scope and field name must match the user question exactly.',
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

export function buildKnowledgeQaStreamingUserPrompt(
  query: string,
  hits: KnowledgeSearchHit[],
  includeReasoning: boolean,
  evidence: {
    evidenceGateStatus?: 'pass' | 'degraded' | 'blocked'
    evidenceCoverage?: number
    evidenceFacts?: KnowledgeEvidenceFact[]
  } = {}
): string {
  const evidenceFacts = buildKnowledgeEvidenceFactsContext(evidence.evidenceFacts ?? [])
  const context = buildKnowledgeQaContext(hits, evidence.evidenceFacts ?? []) || '(no knowledge excerpts found)'
  const evidencePolicy = [
    `Evidence gate status: ${evidence.evidenceGateStatus ?? 'pass'}`,
    `Evidence coverage: ${typeof evidence.evidenceCoverage === 'number' ? evidence.evidenceCoverage : 'unknown'}`,
    'Answering rules:',
    '- Treat verified evidence facts as the compact answer checklist extracted from the excerpts, not as optional commentary.',
    '- Answer every requested item that has a matching verified fact before declaring any item missing.',
    '- Use only the knowledge excerpts above for factual claims.',
    '- OCR/VLM/image/attachment/table extracted text is valid evidence once it appears in the excerpts.',
    '- Do not treat "stored in an image/attachment" as a missing-value statement when the excerpt also contains the extracted value.',
    '- If the excerpts do not contain a requested fact, say that the fact is not found in the retrieved evidence.',
    '- Do not infer exact numbers, dates, roles, thresholds, or identifiers from similar documents.',
    '- When a verified fact contains an exact requested identifier, role, risk label, threshold, or number, copy that exact value instead of paraphrasing or replacing it with a broader description.',
    '- Answer only the fields explicitly requested by the user; never add adjacent fields, even as parentheses, notes, caveats, or extra context.',
    '- A final answer is invalid if it contains an unrequested concrete number, role, threshold, identifier, or configuration value.',
    '- When the user asks for the purpose, meaning, or definition of a field, answer that direct purpose only. Do not add related storage requirements, linked fields, validation labels, or operational caveats unless asked.',
    '- Do not cite excerpt indexes or source references unless the user explicitly asks for citations; never write patterns like "[1]", "from [1]", or "鏉ヨ嚜 [1]" in the final answer.',
    '- For before/after or old/new questions, answer only the requested time scope and requested field names. Do not include unrequested neighboring fields.',
    '- Preserve requested qualifiers that disambiguate the answer, such as the subject identifier, scenario, role, condition, status, or time scope. If the user asks for a range handled by a specific role, include that role with the range.',
    '- Prefer one bullet per requested field for multi-fact questions so unrequested neighboring values are not merged into the answer.',
    '- Treat tables, comparison sections, warnings, notes, and exception sections as valid evidence only when they explicitly bind the requested subject to the requested field or value.',
    '- Do not reject evidence merely because it appears in a cautionary or comparative sentence. Reject it only when the text explicitly assigns the value to a different subject or says it is invalid.',
    '- For multi-fact questions, answer item by item and only include items that are supported by evidence.'
  ].join('\n')

  if (!includeReasoning) {
    return [
      `User question:\n${query}`,
      `Verified evidence facts:\n${evidenceFacts}`,
      `Knowledge excerpts for verification:\n${context}`,
      evidencePolicy,
      'Return only the final answer.',
      'Do not include any extra wrapper markers.'
    ].join('\n\n')
  }

  return [
    `User question:\n${query}`,
    `Verified evidence facts:\n${evidenceFacts}`,
    `Knowledge excerpts for verification:\n${context}`,
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
    '- Explicitly avoid fixed labels such as "闂杈圭晫", "璇佹嵁瀹氫綅", "椋庨櫓涓庣己鍙?, "鍥炵瓟绛栫暐" unless the user explicitly asks for that exact structure.',
    '- If you use bullets or mini-headings, make them specific to the current question and let them vary naturally from one query to another.',
    '- For simple questions, 1 to 3 short lines are enough. For complex questions, use a few natural notes or short paragraphs.',
    '- Do not output any extra headings or wrapper markers.',
    '- Match the language of the user question.'
  ].join('\n\n')
}

function buildKnowledgeQaContext(
  hits: KnowledgeSearchHit[],
  facts: KnowledgeEvidenceFact[]
): string {
  const sourceIndexes = new Set(facts.slice(0, 4).map((fact) => fact.sourceIndex))
  const relevantHits = sourceIndexes.size > 0
    ? hits.filter((_, index) => sourceIndexes.has(index + 1))
    : hits

  return relevantHits
    .map(
      (item, index) => `[${index + 1}]
documentId: ${item.documentId}
documentName: ${item.documentName}
content: ${item.content}`
    )
    .join('\n\n')
}

function buildKnowledgeEvidenceFactsContext(facts: KnowledgeEvidenceFact[]): string {
  if (facts.length === 0) {
    return '(no verified evidence facts extracted)'
  }

  return facts
    .map(
      (fact) =>
        `- [${fact.sourceIndex}] ${fact.documentName}: ${fact.text}\n  Query signals: ${fact.matchedTerms.join(', ') || '(none)'}\n  Exact values in fact: ${fact.exactValues.join(', ') || '(none)'}`
    )
    .join('\n')
}


