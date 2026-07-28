import assert from 'node:assert/strict'
import test from 'node:test'

import {
  shouldForwardMemoryRetrievalHints,
  shouldUseGeneralKnowledgeOnly
} from '../../../modules/workspace/chat/workspace-chat.service'

test('general memory intent is forwarded as fallback permission only', () => {
  assert.equal(shouldUseGeneralKnowledgeOnly('general_question'), true)
  assert.equal(shouldUseGeneralKnowledgeOnly('new_question'), false)
})

test('general memory intent does not forward stale retrieval hints into rag scope', () => {
  assert.equal(shouldForwardMemoryRetrievalHints('general_question'), false)
  assert.equal(shouldForwardMemoryRetrievalHints('new_question'), true)
  assert.equal(shouldForwardMemoryRetrievalHints('followup_question'), true)
})
