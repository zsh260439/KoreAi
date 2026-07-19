import assert from 'node:assert/strict'
import test from 'node:test'

import { buildKnowledgeQueryEvidencePlan } from './knowledge-evidence-planner'

test('多字段精确查询会扩充证据预算', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'MD-QLT-01 的主控制阈值 责任角色和响应时限分别是什么',
    analysis: null,
    protectedTerms: ['MD-QLT-01'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.equal(plan.complexity, 'multi_fact')
  assert.equal(plan.targetTopK, 6)
  assert.deepEqual(plan.evidenceTerms, ['主控制阈值', '责任角色', '响应时限'])
})
