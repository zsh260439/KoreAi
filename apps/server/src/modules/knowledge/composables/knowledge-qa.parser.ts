import type { ChatModelStreamEvent } from '@langchain/core/language_models/event'
import type { KnowledgeQaDeltaEvent } from 'share-type'

type KnowledgeQaSectionStreamPhase = 'seeking_thinking' | 'thinking' | 'answer'

export type KnowledgeQaSectionStreamState = {
  phase: KnowledgeQaSectionStreamPhase
  buffer: string
  pendingEvents: KnowledgeQaDeltaEvent[]
}

const THINKING_HEADER = '## Thinking'
const ANSWER_HEADER = '## Answer'
const SECTION_TAIL_SIZE = ANSWER_HEADER.length + 6
const THINKING_HEADER_PATTERN = /^(?:[ \t]*\r?\n)*## Thinking[ \t]*(?:\r?\n|$)/
const ANSWER_HEADER_PATTERN = /^(?:[ \t]*\r?\n)*## Answer[ \t]*(?:\r?\n|$)/

export function createKnowledgeQaSectionStreamState(): KnowledgeQaSectionStreamState {
  return {
    phase: 'seeking_thinking',
    buffer: '',
    pendingEvents: []
  }
}

export function extractStreamingTextDelta(event: ChatModelStreamEvent): string {
  if (event.event !== 'content-block-delta') {
    return ''
  }

  return event.delta.type === 'text-delta' ? event.delta.text : ''
}

export function parseKnowledgeQaSectionedDelta(
  state: KnowledgeQaSectionStreamState,
  delta: string
): KnowledgeQaDeltaEvent[] {
  if (!delta) {
    return []
  }

  state.buffer += delta
  consumeKnowledgeQaSectionStream(state, false)
  return takeKnowledgeQaStreamDeltaEvents(state)
}

export function flushKnowledgeQaSectionedDelta(
  state: KnowledgeQaSectionStreamState
): KnowledgeQaDeltaEvent[] {
  consumeKnowledgeQaSectionStream(state, true)
  return takeKnowledgeQaStreamDeltaEvents(state)
}

function consumeKnowledgeQaSectionStream(
  state: KnowledgeQaSectionStreamState,
  isFinal: boolean
): void {
  if (state.phase === 'seeking_thinking') {
    const thinkingHeader = state.buffer.match(THINKING_HEADER_PATTERN)
    const answerHeader = state.buffer.match(ANSWER_HEADER_PATTERN)
    if (thinkingHeader) {
      state.buffer = state.buffer.slice(thinkingHeader[0].length)
      state.phase = 'thinking'
    } else if (answerHeader) {
      state.buffer = state.buffer.slice(answerHeader[0].length)
      state.phase = 'answer'
    } else if (!isFinal) {
      return
    } else {
      pushKnowledgeQaStreamDeltaEvent(state, 'answer_delta', trimLeadingSectionBreaks(state.buffer))
      state.buffer = ''
      state.phase = 'answer'
      return
    }
  }

  if (state.phase === 'thinking') {
    const answerHeader = findAnswerHeader(state.buffer, isFinal)
    if (answerHeader) {
      pushKnowledgeQaStreamDeltaEvent(
        state,
        'thinking_delta',
        trimTrailingSectionBreaks(state.buffer.slice(0, answerHeader.start))
      )
      state.buffer = trimLeadingSectionBreaks(state.buffer.slice(answerHeader.end))
      state.phase = 'answer'
    } else {
      const stableLength = isFinal ? state.buffer.length : Math.max(0, state.buffer.length - SECTION_TAIL_SIZE)
      if (stableLength > 0) {
        pushKnowledgeQaStreamDeltaEvent(state, 'thinking_delta', state.buffer.slice(0, stableLength))
        state.buffer = state.buffer.slice(stableLength)
      }
    }
  }

  if (state.phase === 'answer' && state.buffer) {
    pushKnowledgeQaStreamDeltaEvent(
      state,
      'answer_delta',
      isFinal ? trimLeadingSectionBreaks(state.buffer) : state.buffer
    )
    state.buffer = ''
  }
}

function findAnswerHeader(
  buffer: string,
  isFinal: boolean
): { start: number; end: number } | null {
  const pattern = isFinal
    ? /(?:^|\r?\n\r?\n|\r?\n)## Answer[ \t]*(?:\r?\n|$)/
    : /(?:^|\r?\n\r?\n|\r?\n)## Answer[ \t]*\r?\n/

  const matched = pattern.exec(buffer)
  if (!matched) {
    return null
  }

  return {
    start: matched.index,
    end: matched.index + matched[0].length
  }
}

function pushKnowledgeQaStreamDeltaEvent(
  state: KnowledgeQaSectionStreamState,
  type: KnowledgeQaDeltaEvent['type'],
  delta: string
): void {
  if (!delta) {
    return
  }

  state.pendingEvents.push({
    type,
    delta
  })
}

function takeKnowledgeQaStreamDeltaEvents(
  state: KnowledgeQaSectionStreamState
): KnowledgeQaDeltaEvent[] {
  const events = state.pendingEvents.slice()
  state.pendingEvents.length = 0
  return events
}

function trimLeadingSectionBreaks(value: string): string {
  return value.replace(/^(?:[ \t]*\r?\n)+/, '')
}

function trimTrailingSectionBreaks(value: string): string {
  return value.replace(/(?:\r?\n[ \t]*)+$/, '')
}
