import assert from 'node:assert/strict'
import test from 'node:test'

import { detectKnowledgeQueryRuleSignal } from '../../../modules/knowledge/pipeline/query-understanding/knowledge-query-rule-router'

test('compact identifier query keeps separated identifier aliases', () => {
  const signal = detectKnowledgeQueryRuleSignal('pdfsec03 的 ESCALATION WINDOW 是什么?')

  assert.equal(signal.route, 'exact_lookup')
  assert.equal(signal.confidence, 'high')
  assert.ok(signal.exactTerms.includes('pdfsec03'))
  assert.ok(signal.exactTerms.includes('pdf-sec-03'))
})
