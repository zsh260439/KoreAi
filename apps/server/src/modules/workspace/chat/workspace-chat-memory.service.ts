import { ChatOpenAI } from '@langchain/openai'
import { Injectable, Logger } from '@nestjs/common'
import type { KnowledgeSearchDebugInfo, KnowledgeSearchHit, WorkspaceMessage } from 'share-type'
import { KnowledgeConfigService } from '../../knowledge/runtime/config/knowledge-config.service'

export type WorkspaceChatMemoryIntent =
  | 'followup_question'
  | 'new_question'
  | 'general_question'
  | 'acknowledgement'
  | 'chitchat'

export type WorkspaceChatMemoryResolution = {
  intent: WorkspaceChatMemoryIntent
  groundedQuery: string
  directAnswer: string | null
  scopeSummary: string | null
  memoryBoardSummary: string | null
  retrievalHints: string[]
  memoryBoardSource: 'local' | 'llm' | 'none'
  memoryMatchDebug?: NonNullable<KnowledgeSearchDebugInfo['memoryMatchDebug']>
  memoryClarificationCandidates?: NonNullable<KnowledgeSearchDebugInfo['memoryClarificationCandidates']>
  applied: boolean
}

type JsonRecord = Record<string, unknown>

const RECENT_MESSAGE_LIMIT = 6
const MESSAGE_PREVIEW_LIMIT = 420
const ACTIVE_MEMORY_ENTRY_LIMIT = 8
const MAX_MEMORY_SCOPE_ENTRIES = 8
const EXPLICIT_KNOWLEDGE_REFERENCE_PATTERN =
  /\b(?:[a-z0-9]+(?:[-_./:][a-z0-9]+)+|[a-z]{1,12}[-_]?\d{2,}|[\w.-]+\.(?:pdf|docx|md|txt|xlsx|pptx))\b/i
const SAFE_ACKNOWLEDGEMENT_PATTERN =
  /^(?:ok|okay|ojbk|濂界殑?|濂絴鍡?|鍝?|鍝﹀摝|鏀跺埌|浜嗚В|琛寍thanks?|thx)$/i
const SAFE_GREETING_PATTERN = /^(?:hi|hello|hey|浣犲ソ|鎮ㄥソ)$/i
const STRUCTURED_IDENTIFIER_PATTERN =
  /\b[a-z0-9]+(?:[-_./:][a-z0-9]+)+\b|\b[a-z]{2,12}\d{2,4}\b/gi
const MEMORY_KEYWORD_PATTERN =
  /[\p{Script=Han}]{2,}|[a-z][a-z0-9_./-]{2,}/giu

@Injectable()
export class WorkspaceChatMemoryService {
  private readonly logger = new Logger(WorkspaceChatMemoryService.name)
  private warnedMissingConfig = false

  constructor(private readonly configService: KnowledgeConfigService) {}

  async resolveChatMemory(input: {
    query: string
    conversationTitle?: string | null
    messages: WorkspaceMessage[]
  }): Promise<WorkspaceChatMemoryResolution> {
    const query = normalizeSingleLine(input.query)
    const localMemory = buildLocalMemoryBoard(query, input.messages)
    if (!query) {
      return createPassthroughResolution(query, localMemory)
    }

    const safeReply = resolveSafeDirectReply(query)
    if (safeReply) {
      return {
        intent: SAFE_GREETING_PATTERN.test(query) ? 'chitchat' : 'acknowledgement',
        groundedQuery: query,
        directAnswer: safeReply,
        scopeSummary: null,
        memoryBoardSummary: localMemory.summary,
        retrievalHints: [],
        memoryBoardSource: localMemory.summary ? 'local' : 'none',
        memoryMatchDebug: localMemory.matchDebug,
        applied: true
      }
    }

    if (hasExplicitKnowledgeReference(query)) {
      return createPassthroughResolution(query, localMemory)
    }

    if (localMemory.clarificationCandidates.length > 0) {
      return createMemoryClarificationResolution(query, localMemory)
    }

    if (localMemory.strongMatch) {
      return createLocalMemoryResolution(query, localMemory)
    }

    const client = await this.createClient()
    if (!client) {
      return createPassthroughResolution(query, localMemory)
    }

    try {
      const response = await client.invoke([
        {
          role: 'system',
          content: buildMemorySystemPrompt()
        },
        {
          role: 'user',
          content: buildMemoryUserPrompt({
            query,
            conversationTitle: input.conversationTitle,
            messages: input.messages
          })
        }
      ])
      return parseMemoryResolution(normalizeChatContent(response.content), query, localMemory)
        ?? createPassthroughResolution(query, localMemory)
    } catch (error) {
      this.logger.warn(`Short-term memory skipped: ${formatErrorMessage(error)}`)
      return createPassthroughResolution(query, localMemory)
    }
  }

  private async createClient(): Promise<ChatOpenAI | null> {
    const provider = await this.configService.findProviderSettings()
    const apiKey = process.env.LLM_API_KEY
    const model = provider.runtimeConfig.llm.model
    if (!apiKey || !model) {
      if (!this.warnedMissingConfig) {
        this.logger.warn('Short-term memory is enabled but LLM_API_KEY / LLM_MODEL is missing')
        this.warnedMissingConfig = true
      }
      return null
    }

    return new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      configuration: {
        baseURL: normalizeLlmBaseUrl(provider.runtimeConfig.llm.baseUrl ?? undefined)
      }
    })
  }
}

function buildMemorySystemPrompt(): string {
  return [
    'You are a short-term memory resolver for a retrieval-augmented workspace chat.',
    'Classify how the current user message relates to the recent conversation.',
    'Use conversation context only to resolve omissions and references before retrieval.',
    'Never answer factual knowledge-base questions in this step.',
    'Never invent facts, values, roles, identifiers, or document names.',
    'Return JSON only with these keys: intent, groundedQuery, directAnswer, scopeSummary, memoryBoard, retrievalHints.',
    'intent must be one of: followup_question, new_question, general_question, acknowledgement, chitchat.',
    'For followup_question, groundedQuery must be a standalone retrieval query with the missing subject or document restored.',
    'For new_question, groundedQuery must equal the current user message unless only whitespace changed, and it should still be searched in the knowledge base.',
    'For general_question, use it only when the message asks open-world/common knowledge and does not refer to the current knowledge-base documents or prior cited evidence.',
    'For acknowledgement or chitchat, directAnswer must be a short user-facing reply and groundedQuery may equal the user message.',
    'memoryBoard must summarize the current workspace context as: goal, currentTopic, referencedObjects, confirmedFacts, openTodos.',
    'retrievalHints must contain only short terms useful for RAG recall, never full instructions. Keep at most 8 terms.'
  ].join('\n')
}

function buildMemoryUserPrompt(input: {
  query: string
  conversationTitle?: string | null
  messages: WorkspaceMessage[]
}): string {
  return [
    `Current user message:\n${input.query}`,
    `Conversation title:\n${input.conversationTitle ?? '(untitled)'}`,
    `Primary retrieval scope:\n${formatPrimaryRetrievalScope(input.messages)}`,
    `Recent conversation context:\n${formatRecentMessages(input.messages)}`,
    [
      'Decision rules:',
      '- If the current message is just an acknowledgement or greeting, do not send it to retrieval.',
      '- If it asks a new topic that still sounds like a document/knowledge-base lookup, keep it as new_question.',
      '- If it asks general public knowledge, game/person/concept explanation, learning help, or an open-world question unrelated to cited documents, classify it as general_question.',
      '- If it says things like "浠栫殑", "杩欎釜", "鍛?, "閭ｄ釜瀛楁", or omits the document/subject, resolve it from the recent conversation.',
      '- For follow-up questions, prefer the Primary retrieval scope and do not mix multiple documents.',
      '- If Primary retrieval scope is (none), do not resolve document or field references from older cited messages; classify them as new_question unless they are clearly general_question.',
      '- Do not classify a question with explicit document IDs, filenames, record IDs, citations, chunks, or knowledge-base scope as general_question.',
      '- Do not copy previous numeric answers or factual sentences into groundedQuery unless the current message explicitly asks about them.',
      '- The resolved query is only for retrieval; it must not contain instruction text or a memory summary.',
      '- Keep exact IDs, filenames, field names, and business terms verbatim.'
    ].join('\n')
  ].join('\n\n')
}

function formatPrimaryRetrievalScope(messages: WorkspaceMessage[]): string {
  const hit = findLatestPrimaryCitation(messages)
  if (!hit) {
    return '(none)'
  }

  const identifiers = extractStructuredIdentifiers([
    hit.documentName,
    hit.primaryTitle ?? '',
    hit.sectionPath ?? '',
    hit.content
  ].join(' '))
  const sectionPath = normalizeSectionPath(hit.sectionPath)
  const fields = [
    identifiers.length ? `Identifiers: ${identifiers.join('; ')}` : '',
    hit.documentName ? `Document: ${hit.documentName}` : '',
    hit.primaryTitle ? `Primary title: ${hit.primaryTitle}` : '',
    sectionPath ? `Section: ${sectionPath}` : ''
  ].filter(Boolean)

  return fields.length ? fields.join('\n') : '(none)'
}

function findLatestPrimaryCitation(messages: WorkspaceMessage[]): KnowledgeSearchHit | null {
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant')
  if (!latestAssistantMessage?.citations?.length) {
    return null
  }

  return latestAssistantMessage.citations[0]
}

function extractStructuredIdentifiers(value: string): string[] {
  return uniqueStrings(value.match(STRUCTURED_IDENTIFIER_PATTERN) ?? []).slice(0, 4)
}

function normalizeSectionPath(value?: string | null): string {
  if (!value) {
    return ''
  }

  return value
    .split(/[>/]/)
    .map((item) => item.trim())
    .filter((item) =>
      item &&
      !/^绗琝s*\d+\s*椤?/i.test(item) &&
      !/VLM\s*缁撴瀯澧炲己/i.test(item)
    )
    .slice(0, 2)
    .join(' > ')
}

function formatRecentMessages(messages: WorkspaceMessage[]): string {
  const recentMessages = messages.slice(-RECENT_MESSAGE_LIMIT)
  if (recentMessages.length === 0) {
    return '(none)'
  }

  return recentMessages
    .map((message) =>
      `[${message.role}] ${normalizeSingleLine(message.content).slice(0, MESSAGE_PREVIEW_LIMIT)}`
    )
    .join('\n')
}

function parseMemoryResolution(
  content: string,
  fallbackQuery: string,
  localMemory: LocalMemoryBoard
): WorkspaceChatMemoryResolution | null {
  const jsonText = extractJsonText(content)
  if (!jsonText) {
    return null
  }

  const parsed = safeJsonParse(jsonText)
  if (!isJsonRecord(parsed)) {
    return null
  }

  const intent = normalizeIntent(parsed.intent)
  const groundedQuery = normalizeSingleLine(parsed.groundedQuery) || fallbackQuery
  const directAnswer = normalizeSingleLine(parsed.directAnswer)
  const scopeSummary = normalizeSingleLine(parsed.scopeSummary)
  const memoryBoardSummary = normalizeMemoryBoardSummary(parsed.memoryBoard) ?? localMemory.summary
  const retrievalHints = uniqueStrings([
    ...normalizeStringArray(parsed.retrievalHints, 8),
    ...localMemory.hints
  ]).slice(0, 8)
  const shouldBypassRag = intent === 'acknowledgement' || intent === 'chitchat'

  return {
    intent,
    groundedQuery,
    directAnswer: shouldBypassRag ? directAnswer || resolveSafeDirectReply(fallbackQuery) : null,
    scopeSummary: scopeSummary || null,
    memoryBoardSummary,
    retrievalHints,
    memoryBoardSource: normalizeMemoryBoardSummary(parsed.memoryBoard) ? 'llm' : localMemory.summary ? 'local' : 'none',
    memoryMatchDebug: localMemory.matchDebug,
    memoryClarificationCandidates: localMemory.clarificationCandidates,
    applied: shouldBypassRag || normalizeLoose(groundedQuery) !== normalizeLoose(fallbackQuery)
  }
}

function createPassthroughResolution(
  query: string,
  localMemory: LocalMemoryBoard = {
    summary: null,
    hints: [],
    strongMatch: false,
    matchDebug: createEmptyMemoryMatchDebug(),
    clarificationCandidates: []
  }
): WorkspaceChatMemoryResolution {
  return {
    intent: 'new_question',
    groundedQuery: query,
    directAnswer: null,
    scopeSummary: null,
    memoryBoardSummary: localMemory.summary,
    retrievalHints: localMemory.hints,
    memoryBoardSource: localMemory.summary ? 'local' : 'none',
    memoryMatchDebug: localMemory.matchDebug,
    memoryClarificationCandidates: localMemory.clarificationCandidates,
    applied: false
  }
}

function createLocalMemoryResolution(
  query: string,
  localMemory: LocalMemoryBoard
): WorkspaceChatMemoryResolution {
  return {
    intent: looksLikeFollowUp(query) ? 'followup_question' : 'new_question',
    groundedQuery: buildLocalMemoryGroundedQuery(query, localMemory.hints),
    directAnswer: null,
    scopeSummary: null,
    memoryBoardSummary: localMemory.summary,
    retrievalHints: localMemory.hints,
    memoryBoardSource: 'local',
    memoryMatchDebug: localMemory.matchDebug,
    memoryClarificationCandidates: localMemory.clarificationCandidates,
    applied: localMemory.hints.length > 0
  }
}

function createMemoryClarificationResolution(
  query: string,
  localMemory: LocalMemoryBoard
): WorkspaceChatMemoryResolution {
  return {
    intent: 'followup_question',
    groundedQuery: query,
    directAnswer: buildMemoryClarificationAnswer(localMemory.clarificationCandidates),
    scopeSummary: null,
    memoryBoardSummary: localMemory.summary,
    retrievalHints: [],
    memoryBoardSource: 'local',
    memoryMatchDebug: localMemory.matchDebug,
    memoryClarificationCandidates: localMemory.clarificationCandidates,
    applied: true
  }
}

function buildLocalMemoryGroundedQuery(query: string, hints: string[]): string {
  const documentHints = hints.filter((hint) => /\.[a-z0-9]+$/i.test(hint)).slice(0, 2)
  const identifierHints = hints.filter((hint) =>
    !documentHints.includes(hint) && isRecordScopeIdentifier(hint)
  ).slice(0, 6)
  return uniqueStrings([
    query,
    ...documentHints,
    ...identifierHints
  ]).join(' ')
}

function buildMemoryClarificationAnswer(
  candidates: NonNullable<KnowledgeSearchDebugInfo['memoryClarificationCandidates']>
): string {
  const lines = candidates
    .map((item, index) => {
      const identifiers = item.identifiers.length ? `（${item.identifiers.join(' / ')}）` : ''
      return `${index + 1}. ${item.documentName}${identifiers}`
    })
    .join('\n')

  return [
    '这里的“它们”可能指向多份历史文档，我不直接猜范围。请先选择要对比的文档：',
    lines
  ].join('\n')
}

function resolveSafeDirectReply(query: string): string | null {
  if (SAFE_GREETING_PATTERN.test(query)) {
    return '你好。你可以直接问我文档里的字段、阈值、角色或处置代码。'
  }

  if (SAFE_ACKNOWLEDGEMENT_PATTERN.test(query)) {
    return '好的。你可以继续问这个文档里的具体字段，我会按当前知识库证据回答。'
  }

  return null
}

function hasExplicitKnowledgeReference(query: string): boolean {
  return EXPLICIT_KNOWLEDGE_REFERENCE_PATTERN.test(query)
}

type LocalMemoryBoard = {
  summary: string | null
  hints: string[]
  strongMatch: boolean
  matchDebug: NonNullable<KnowledgeSearchDebugInfo['memoryMatchDebug']>
  clarificationCandidates: NonNullable<KnowledgeSearchDebugInfo['memoryClarificationCandidates']>
}

type MemoryFactEntry = {
  documentName: string
  identifiers: string[]
  sectionPath: string
  facts: string[]
  hints: string[]
  recency: number
  firstSeen: number
  lastSeen: number
  mentionOrder: number
}

type MemorySelection = {
  entries: MemoryFactEntry[]
  strongMatch: boolean
  debug: NonNullable<KnowledgeSearchDebugInfo['memoryMatchDebug']>
  clarificationCandidates: MemoryFactEntry[]
}

function buildLocalMemoryBoard(query: string, messages: WorkspaceMessage[]): LocalMemoryBoard {
  const entries = buildMemoryFactEntries(messages)
  const selection = selectRelevantMemoryEntries(query, entries)
  const selectedEntries = selection.entries
  const referencedObjects = uniqueStrings(
    selectedEntries.flatMap((entry) => [
      ...entry.identifiers.filter(isRecordScopeIdentifier),
      entry.documentName,
      entry.sectionPath
    ])
  ).filter(Boolean)
  const confirmedFacts = selectedEntries
    .flatMap((entry) => entry.facts)
    .slice(0, 4)

  const parts = [
    query ? `goal: ${query}` : '',
    entries.length ? `memoryPool: ${entries.length} scoped item(s)` : '',
    referencedObjects.length ? `referencedObjects: ${referencedObjects.slice(0, 6).join('; ')}` : '',
    confirmedFacts.length ? `confirmedFacts: ${confirmedFacts.join('; ')}` : '',
    'openTodos: -'
  ].filter(Boolean)

  return {
    summary: parts.length ? parts.join('\n') : null,
    hints: buildSelectedMemoryHints(selectedEntries),
    strongMatch: selection.strongMatch,
    matchDebug: selection.debug,
    clarificationCandidates: selection.clarificationCandidates.map(toMemoryClarificationCandidate)
  }
}

function buildSelectedMemoryHints(entries: MemoryFactEntry[]): string[] {
  const groundingHints = uniqueStrings(
    entries.flatMap((entry) => [
      ...entry.identifiers.filter(isRecordScopeIdentifier),
      entry.documentName,
      entry.sectionPath
    ])
  )
  const groundingHintKeys = new Set(groundingHints.map((hint) => normalizeLoose(hint)))
  const recallHints = uniqueStrings(entries.flatMap((entry) => entry.hints))
    .filter((hint) =>
      !groundingHintKeys.has(normalizeLoose(hint)) &&
      !isRecordScopeIdentifier(hint) &&
      !isNonScopeStructuredIdentifier(hint)
    )

  return uniqueStrings([
    ...groundingHints,
    ...recallHints
  ]).slice(0, 12)
}

function buildMemoryFactEntries(messages: WorkspaceMessage[]): MemoryFactEntry[] {
  const entries = new Map<string, MemoryFactEntry>()

  messages.forEach((message, messageIndex) => {
    if (message.role !== 'assistant' || !message.citations?.length) {
      return
    }

    const facts = extractAnswerFacts(message.content)
    for (const [citationIndex, citation] of message.citations.slice(0, 4).entries()) {
      const identifiers = extractStructuredIdentifiers([
        citation.documentName,
        citation.primaryTitle ?? '',
        citation.sectionPath ?? '',
        citation.content
      ].join(' ')).filter(isRecordScopeIdentifier)
      const sectionPath = normalizeSectionPath(citation.sectionPath)
      const key = buildMemoryEntryKey(citation.documentName, identifiers)
      const current = entries.get(key)
      const hints = uniqueStrings([
        ...extractStructuredIdentifiers(message.content),
        ...identifiers,
        citation.documentName,
        sectionPath,
        ...extractMemoryKeywords(message.content),
        ...extractMemoryKeywords(citation.content)
      ]).filter(Boolean)

      if (!current) {
        entries.set(key, {
          documentName: citation.documentName,
          identifiers,
          sectionPath,
          facts,
          hints,
          recency: messageIndex,
          firstSeen: messageIndex,
          lastSeen: messageIndex,
          mentionOrder: messageIndex * 10 + citationIndex
        })
        continue
      }

      entries.set(key, {
        documentName: current.documentName,
        identifiers: uniqueStrings([...current.identifiers, ...identifiers]).slice(0, 6),
        sectionPath: current.sectionPath || sectionPath,
        facts: uniqueStrings([...facts, ...current.facts]).slice(0, 6),
        hints: uniqueStrings([...hints, ...current.hints]).slice(0, 8),
        recency: Math.max(current.recency, messageIndex),
        firstSeen: Math.min(current.firstSeen, messageIndex),
        lastSeen: Math.max(current.lastSeen, messageIndex),
        mentionOrder: current.lastSeen > messageIndex
          ? current.mentionOrder
          : messageIndex * 10 + citationIndex
      })
    }
  })

  return [...entries.values()].sort((left, right) =>
    right.recency - left.recency || right.mentionOrder - left.mentionOrder
  )
}

function selectRelevantMemoryEntries(
  query: string,
  entries: MemoryFactEntry[]
): MemorySelection {
  if (entries.length === 0) {
    return {
      entries: [],
      strongMatch: false,
      debug: createEmptyMemoryMatchDebug(),
      clarificationCandidates: []
    }
  }

  const activeEntries = entries.slice(0, ACTIVE_MEMORY_ENTRY_LIMIT)
  const queryIdentifiers = extractStructuredIdentifiers(query)
  if (queryIdentifiers.length > 0) {
    const matchedEntries = activeEntries
      .filter((entry) =>
        entry.identifiers.some((identifier) =>
          queryIdentifiers.some((queryIdentifier) =>
            areCompatibleStructuredIdentifiers(identifier, queryIdentifier)
          )
        ) ||
        queryIdentifiers.some((queryIdentifier) =>
          normalizeLoose(entry.documentName).includes(normalizeLoose(queryIdentifier))
        )
      )
      .slice(0, 3)
    return createMemorySelection(
      entries,
      matchedEntries,
      matchedEntries.length > 0,
      (entry) => ({
        matchedTerms: matchEntryIdentifiers(entry, queryIdentifiers),
        score: matchEntryIdentifiers(entry, queryIdentifiers).length,
        reason: 'explicit_object'
      }),
      'explicit_object_mismatch'
    )
  }

  if (looksLikeFollowUp(query)) {
    const latestRecency = Math.max(...activeEntries.map((entry) => entry.recency))
    const latestEntries = [...activeEntries]
      .filter((entry) => entry.recency === latestRecency)
      .sort((left, right) => right.recency - left.recency)
    const multiObjectFollowUp = looksLikeMultiObjectFollowUp(query)
    const ordinalSelectionRequested = multiObjectFollowUp && hasOrdinalSelection(query)
    const multiObjectSelection = multiObjectFollowUp && !ordinalSelectionRequested
      ? resolveMultiObjectFollowUpEntries(activeEntries, latestEntries)
      : null
    const ordinalEntries = ordinalSelectionRequested
      ? sortByMentionOrder(entries)
      : []
    const selectedEntries = multiObjectFollowUp
      ? applyOrdinalSelection(query, multiObjectSelection?.entries ?? ordinalEntries)
      : latestEntries.slice(0, 1)
    const clarificationCandidates = multiObjectFollowUp && !hasOrdinalSelection(query) && selectedEntries.length === 0
      ? activeEntries
      : []

    return createMemorySelection(
      entries,
      selectedEntries,
      multiObjectFollowUp || selectedEntries.length > 0,
      () => ({
        matchedTerms: [],
        score: 1,
        reason: multiObjectSelection?.reason ?? 'latest_citation_followup'
      }),
      multiObjectFollowUp ? 'outside_multi_object_scope' : 'older_than_latest_citation',
      clarificationCandidates
    )
  }

  const queryKeywords = extractMemoryKeywords(query)
  const scoredEntries = activeEntries
    .map((entry) => ({
      entry,
      score: scoreMemoryEntry(queryKeywords, entry),
      matchedTerms: matchEntryKeywords(queryKeywords, entry)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.entry.recency - left.entry.recency)
  const rankedEntries = scoredEntries.slice(0, 3).map((item) => item.entry)

  return createMemorySelection(
    entries,
    rankedEntries,
    scoredEntries[0]?.score >= 2,
    (entry) => {
      const scored = scoredEntries.find((item) => item.entry === entry)
      return {
        matchedTerms: scored?.matchedTerms ?? [],
        score: scored?.score ?? 0,
        reason: 'keyword_match'
      }
    },
    'no_keyword_match'
  )
}

function extractAnswerFacts(content: string): string[] {
  return normalizeSingleLine(content)
    .split(/(?<=[銆?!?])\s+|[锛?]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4)
    .slice(0, 4)
}

function extractMemoryKeywords(value: string): string[] {
  const tokens = normalizeSingleLine(value).match(MEMORY_KEYWORD_PATTERN) ?? []
  return uniqueStrings([
    ...tokens,
    ...tokens.flatMap(extractCjkMemoryShingles)
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
  ).slice(0, 120)
}

function extractCjkMemoryShingles(value: string): string[] {
  if (!/^[\p{Script=Han}]+$/u.test(value)) {
    return []
  }

  const result: string[] = []
  for (const size of [2, 3, 4, 5, 6]) {
    for (let index = 0; index <= value.length - size; index += 1) {
      result.push(value.slice(index, index + size))
    }
  }
  return result
}

function scoreMemoryEntry(queryKeywords: string[], entry: MemoryFactEntry): number {
  if (queryKeywords.length === 0) {
    return 0
  }

  const entryKeywords = uniqueStrings([
    ...entry.hints,
    ...entry.facts.flatMap(extractMemoryKeywords)
  ]).map(normalizeLoose)

  return queryKeywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeLoose(keyword)
    if (!normalizedKeyword) {
      return score
    }

    return score + (entryKeywords.some((item) =>
      item.includes(normalizedKeyword) || normalizedKeyword.includes(item)
    ) ? 1 : 0)
  }, 0)
}

function createMemorySelection(
  allEntries: MemoryFactEntry[],
  selectedEntries: MemoryFactEntry[],
  strongMatch: boolean,
  describeSelected: (entry: MemoryFactEntry) => {
    matchedTerms: string[]
    score: number
    reason: string
  },
  droppedReason: string,
  clarificationCandidates: MemoryFactEntry[] = []
): MemorySelection {
  const selectedKeys = new Set(selectedEntries.map(buildMemoryDebugEntryKey))
  return {
    entries: selectedEntries,
    strongMatch,
    debug: {
      selected: selectedEntries.map((entry) => {
        const selected = describeSelected(entry)
        return {
          documentName: entry.documentName,
          identifiers: entry.identifiers,
          sectionPath: entry.sectionPath || null,
          firstSeen: entry.firstSeen,
          lastSeen: entry.lastSeen,
          mentionOrder: entry.mentionOrder,
          matchedTerms: selected.matchedTerms,
          score: selected.score,
          reason: selected.reason
        }
      }),
      dropped: allEntries
        .filter((entry) => !selectedKeys.has(buildMemoryDebugEntryKey(entry)))
        .map((entry) => ({
          documentName: entry.documentName,
          identifiers: entry.identifiers,
          firstSeen: entry.firstSeen,
          lastSeen: entry.lastSeen,
          mentionOrder: entry.mentionOrder,
          reason: droppedReason
        }))
    },
    clarificationCandidates: sortByMentionOrder(clarificationCandidates)
  }
}

function toMemoryClarificationCandidate(
  entry: MemoryFactEntry
): NonNullable<KnowledgeSearchDebugInfo['memoryClarificationCandidates']>[number] {
  return {
    documentName: entry.documentName,
    identifiers: entry.identifiers,
    sectionPath: entry.sectionPath || null,
    firstSeen: entry.firstSeen,
    lastSeen: entry.lastSeen,
    mentionOrder: entry.mentionOrder
  }
}

function createEmptyMemoryMatchDebug(): NonNullable<KnowledgeSearchDebugInfo['memoryMatchDebug']> {
  return { selected: [], dropped: [] }
}

function buildMemoryDebugEntryKey(entry: MemoryFactEntry): string {
  return `${entry.documentName}:${entry.identifiers.join('|')}:${entry.recency}`
}

function matchEntryIdentifiers(entry: MemoryFactEntry, queryIdentifiers: string[]): string[] {
  return uniqueStrings(
    queryIdentifiers.filter((queryIdentifier) =>
      entry.identifiers.some((identifier) =>
        areCompatibleStructuredIdentifiers(identifier, queryIdentifier)
      ) ||
      normalizeCanonicalObjectKey(entry.documentName).includes(normalizeCanonicalObjectKey(queryIdentifier))
    )
  )
}

function matchEntryKeywords(queryKeywords: string[], entry: MemoryFactEntry): string[] {
  const entryKeywords = uniqueStrings([
    ...entry.hints,
    ...entry.facts.flatMap(extractMemoryKeywords)
  ]).map(normalizeLoose)

  return uniqueStrings(queryKeywords.filter((keyword) => {
    const normalizedKeyword = normalizeLoose(keyword)
    return normalizedKeyword && entryKeywords.some((item) =>
      item.includes(normalizedKeyword) || normalizedKeyword.includes(item)
    )
  }))
}

function resolveMultiObjectFollowUpEntries(
  entries: MemoryFactEntry[],
  latestEntries: MemoryFactEntry[]
): { entries: MemoryFactEntry[]; reason: string } | null {
  if (latestEntries.length >= 2) {
    return {
      entries: sortByMentionOrder(latestEntries).slice(0, MAX_MEMORY_SCOPE_ENTRIES),
      reason: 'latest_multi_citation_followup'
    }
  }

  const sameFamilyEntries = collectRecentSameFamilyEntries(entries)
  if (sameFamilyEntries.length >= 2) {
    return {
      entries: sortByMentionOrder(sameFamilyEntries).slice(0, MAX_MEMORY_SCOPE_ENTRIES),
      reason: 'recent_same_family_window'
    }
  }

  if (entries.length === 2) {
    return {
      entries: sortByMentionOrder(entries),
      reason: 'only_two_memory_objects'
    }
  }

  return null
}

function applyOrdinalSelection(query: string, entries: MemoryFactEntry[]): MemoryFactEntry[] {
  if (entries.length === 0) {
    return []
  }

  const orderedEntries = sortByMentionOrder(entries)
  const rangeSelection = resolveOrdinalRange(query, orderedEntries.length)
  if (rangeSelection) {
    return orderedEntries
      .slice(rangeSelection.start, rangeSelection.end + 1)
      .slice(0, MAX_MEMORY_SCOPE_ENTRIES)
  }

  const ordinalIndex = resolveOrdinalIndex(query)
  if (ordinalIndex !== null) {
    return orderedEntries.slice(ordinalIndex, ordinalIndex + 1)
  }

  const headCount = resolveHeadCount(query)
  if (headCount !== null) {
    return orderedEntries.slice(0, headCount).slice(0, MAX_MEMORY_SCOPE_ENTRIES)
  }

  const tailCount = resolveTailCount(query)
  if (tailCount !== null) {
    return orderedEntries
      .slice(Math.max(orderedEntries.length - tailCount, 0))
      .slice(0, MAX_MEMORY_SCOPE_ENTRIES)
  }

  if (/(?:前者|first|former)/i.test(query)) {
    return orderedEntries.slice(0, 1)
  }

  if (/(?:后者|latter)/i.test(query)) {
    return orderedEntries.slice(-1)
  }

  return orderedEntries.slice(0, MAX_MEMORY_SCOPE_ENTRIES)
}

function hasOrdinalSelection(query: string): boolean {
  return /(?:\d+\s*[~-]\s*\d+|第[一二三四五六七八九十\d]+\s*(?:到|至|-|~)\s*第?[一二三四五六七八九十\d]+|前者|后者|第[一二三四五六七八九十\d]+|前[两二三四五六七八九十\d]+|后[两二三四五六七八九十\d]+|最后[两二三四五六七八九十\d]+|first|second|third|former|latter)/i.test(query)
}

function resolveOrdinalRange(
  query: string,
  totalCount: number
): { start: number; end: number } | null {
  const normalizedQuery = normalizeLoose(query)
  const numericRange = normalizedQuery.match(/(\d{1,3})\s*[~-]\s*(\d{1,3})/)
  if (numericRange) {
    return normalizeOrdinalRange(Number(numericRange[1]), Number(numericRange[2]), totalCount)
  }

  const chineseRange = normalizedQuery.match(/第([一二三四五六七八九十\d]+)\s*(?:到|至|-|~)\s*第?([一二三四五六七八九十\d]+)(?:个|份|篇|条|项|者|文档)?/)
  if (chineseRange) {
    const start = parseOrdinalNumber(chineseRange[1])
    const end = parseOrdinalNumber(chineseRange[2])
    return start === null || end === null
      ? null
      : normalizeOrdinalRange(start, end, totalCount)
  }

  return null
}

function normalizeOrdinalRange(
  start: number,
  end: number,
  totalCount: number
): { start: number; end: number } | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
    return null
  }

  const lower = Math.min(start, end)
  const upper = Math.min(Math.max(start, end), totalCount)
  if (lower > totalCount) {
    return null
  }

  return { start: lower - 1, end: upper - 1 }
}

function resolveOrdinalIndex(query: string): number | null {
  const normalizedQuery = normalizeLoose(query)
  const matched = normalizedQuery.match(/第([一二三四五六七八九十\d]+)(?:个|份|篇|条|项|者|文档)?/)
  if (!matched) {
    if (/\bfirst\b/i.test(query)) {
      return 0
    }
    if (/\bsecond\b/i.test(query)) {
      return 1
    }
    if (/\bthird\b/i.test(query)) {
      return 2
    }
    return null
  }

  const value = parseOrdinalNumber(matched[1])
  return value === null ? null : value - 1
}

function resolveHeadCount(query: string): number | null {
  const normalizedQuery = normalizeLoose(query)
  const matched = normalizedQuery.match(/前([两二三四五六七八九十\d]+)(?:个|份|篇|条|项|者|文档)?/)
  if (!matched) {
    return null
  }

  return parseOrdinalNumber(matched[1])
}

function resolveTailCount(query: string): number | null {
  const normalizedQuery = normalizeLoose(query)
  const matched = normalizedQuery.match(/(?:后|最后)([两二三四五六七八九十\d]+)(?:个|份|篇|条|项|者|文档)?/)
  if (!matched) {
    return null
  }

  return parseOrdinalNumber(matched[1])
}

function parseOrdinalNumber(value: string): number | null {
  if (/^\d+$/.test(value)) {
    return Number(value)
  }

  const digitMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  }

  if (digitMap[value] !== undefined) {
    return digitMap[value]
  }

  const tenIndex = value.indexOf('十')
  if (tenIndex < 0) {
    return null
  }

  const beforeTen = value.slice(0, tenIndex)
  const afterTen = value.slice(tenIndex + 1)
  const tens = beforeTen ? digitMap[beforeTen] : 1
  const ones = afterTen ? digitMap[afterTen] : 0
  if (!tens || ones === undefined) {
    return null
  }

  return tens * 10 + ones
}

function sortByMentionOrder(entries: MemoryFactEntry[]): MemoryFactEntry[] {
  return [...entries].sort((left, right) =>
    left.mentionOrder - right.mentionOrder || left.firstSeen - right.firstSeen
  )
}

function collectRecentSameFamilyEntries(entries: MemoryFactEntry[]): MemoryFactEntry[] {
  const orderedEntries = [...entries].sort((left, right) =>
    right.lastSeen - left.lastSeen || right.mentionOrder - left.mentionOrder
  )
  const [latestEntry] = orderedEntries
  if (!latestEntry) {
    return []
  }

  const latestFamilyKey = buildMemoryFamilyKey(latestEntry)
  if (!latestFamilyKey) {
    return []
  }

  const result: MemoryFactEntry[] = []
  let expectedLastSeen = latestEntry.lastSeen
  for (const entry of orderedEntries) {
    if (entry.lastSeen !== expectedLastSeen) {
      break
    }

    if (buildMemoryFamilyKey(entry) !== latestFamilyKey) {
      break
    }
    result.push(entry)
    expectedLastSeen -= 2
  }

  return result
}

function buildMemoryFamilyKey(entry: MemoryFactEntry): string {
  const identifier = entry.identifiers.find(isRecordScopeIdentifier) ??
    entry.identifiers.find((item) => /\d/.test(item))
  if (!identifier) {
    return ''
  }

  return normalizeCanonicalObjectKey(identifier).replace(/\d+$/, '')
}

function buildMemoryEntryKey(documentName: string, identifiers: string[]): string {
  const primaryIdentifier = identifiers.find(isRecordScopeIdentifier) ??
    identifiers.find((identifier) => /\d/.test(identifier))
  return normalizeCanonicalObjectKey(primaryIdentifier || documentName)
}

function isRecordScopeIdentifier(value: string): boolean {
  return /^(?:PDF|DOCX|MD|TXT|XLSX|PPTX)[-_][A-Z0-9]+[-_]\d{1,4}$/i.test(value)
}

function isNonScopeStructuredIdentifier(value: string): boolean {
  return isRecordLikeIdentifier(value) && !isRecordScopeIdentifier(value)
}

function isRecordLikeIdentifier(value: string): boolean {
  return !/\.(?:pdf|docx|md|txt|xlsx|pptx)$/i.test(value) &&
    /[a-z]/i.test(value) &&
    /\d/.test(value) &&
    /[-_]/.test(value)
}

function looksLikeFollowUp(query: string): boolean {
  if (looksLikeMultiObjectFollowUp(query)) {
    return true
  }

  return /^(?:那|那么|所以)?(?:他|它|它们|他们|这些|这几个|这个|那个|该|其|上面|前面|附件|仪表盘|图片|处置代码|预警值|责任角色|主控制阈值|响应时限|呢|是什么|多少|分别是什么|是|that|those|them|their|its|that action code|the action code|action code)[?？。!！\s]*$/i.test(query)
}

function looksLikeMultiObjectFollowUp(query: string): boolean {
  return hasOrdinalSelection(query) ||
    /(?:它们|他们|他們|她们|她們|这些|這些|这几个|這幾個|分别|分別|对比|比較|比较|差异|差異|those|them|their|compare|both)/i.test(query)
}

function areCompatibleStructuredIdentifiers(left: string, right: string): boolean {
  const normalizedLeft = normalizeIdentifier(left)
  const normalizedRight = normalizeIdentifier(right)
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  )
}

function normalizeIdentifier(value: string): string {
  return normalizeCanonicalObjectKey(value).replace(/(?:pdf|docx|md|txt|xlsx|pptx)$/i, '')
}

function normalizeCanonicalObjectKey(value: string): string {
  return normalizeLoose(value).replace(/[-_./:]/g, '')
}

function normalizeIntent(value: unknown): WorkspaceChatMemoryIntent {
  switch (value) {
    case 'followup_question':
    case 'general_question':
    case 'acknowledgement':
    case 'chitchat':
    case 'new_question':
      return value
    default:
      return 'new_question'
  }
}

function normalizeLlmBaseUrl(value?: string): string | undefined {
  return value?.replace(/\/chat\/completions\/?$/, '')
}

function normalizeChatContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (!Array.isArray(value)) {
    return ''
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (isJsonRecord(item) && typeof item.text === 'string') {
        return item.text
      }

      return ''
    })
    .join('\n')
    .trim()
}

function extractJsonText(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return trimmed.slice(start, end + 1)
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function normalizeSingleLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizeMemoryBoardSummary(value: unknown): string | null {
  if (!isJsonRecord(value)) {
    return normalizeSingleLine(value) || null
  }

  const parts = [
    ['goal', value.goal],
    ['currentTopic', value.currentTopic],
    ['referencedObjects', value.referencedObjects],
    ['confirmedFacts', value.confirmedFacts],
    ['openTodos', value.openTodos]
  ].map(([key, item]) => `${key}: ${normalizeMemoryBoardValue(item)}`)
    .filter((item) => !item.endsWith(':'))

  return parts.join('\n') || null
}

function normalizeMemoryBoardValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(normalizeSingleLine).filter(Boolean).slice(0, 8).join('；')
  }

  return normalizeSingleLine(value)
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return uniqueStrings(value.map(normalizeSingleLine).filter(Boolean)).slice(0, limit)
}

function normalizeLoose(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeSingleLine(value)
    if (!normalized) {
      continue
    }

    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(normalized)
  }

  return result
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

