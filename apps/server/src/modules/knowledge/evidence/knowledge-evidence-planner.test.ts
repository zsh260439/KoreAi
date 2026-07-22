import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildKnowledgeQueryEvidencePlan,
  computeKnowledgeEvidenceCoverage,
  hasKnowledgeEvidenceRequirements,
  resolveEvidenceGateStatus
} from './knowledge-evidence-planner'

test('multi-field exact lookup extracts field slots instead of evidence keyword noise', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'MD-QLT-01 的主控制阈值、责任角色和响应时限分别是什么',
    analysis: null,
    protectedTerms: ['MD-QLT-01'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.equal(plan.complexity, 'multi_fact')
  assert.equal(plan.targetTopK, 6)
  assert.deepEqual(plan.fieldSlots, [
    'main_control_threshold',
    'responsible_role',
    'response_time'
  ])
  assert.deepEqual(plan.evidenceTerms, [])
})

test('query without verifiable fields is not treated as fully grounded', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: '能不能只让一个请求去查数据库，其他请求先等着',
    analysis: null,
    protectedTerms: [],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.equal(hasKnowledgeEvidenceRequirements(plan), false)
})

test('field-value lookup requires concrete value near the field label', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-SEC-03 的处置代码是',
    analysis: null,
    protectedTerms: ['PDF-SEC-03'],
    optionalTerms: ['ACTION CODE'],
    excludedTerms: [],
    requestedTopK: 4
  })

  const missingValueCoverage = computeKnowledgeEvidenceCoverage([
    {
      chunkId: 'missing-value',
      documentId: 'doc',
      documentName: 'security_03_complex.pdf',
      content: 'PDF-SEC-03 保持受控。视觉附件中的预警值和处置代码是最终升级动作的唯一依据。',
      score: 1
    }
  ], plan)
  const valueCoverage = computeKnowledgeEvidenceCoverage([
    {
      chunkId: 'with-value',
      documentId: 'doc',
      documentName: 'security_03_complex.pdf',
      content: 'VISUAL CONTROL DASHBOARD Record: PDF-SEC-03 ALERT THRESHOLD 83% ACTION CODE ACT-PSEC-23 ESCALATION WINDOW 4 hours',
      score: 1
    }
  ], plan)

  assert.ok(missingValueCoverage < plan.requiredCoverage)
  assert.equal(valueCoverage, 1)
})

test('same multi-field query keeps body and visual chunks as same-level required evidence', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-ENE-03 的主控制阈值和责任角色是什么？附件仪表盘中的预警值与处置代码分别是什么？',
    analysis: null,
    protectedTerms: ['PDF-ENE-03'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, [
    'main_control_threshold',
    'alert_threshold',
    'action_code',
    'responsible_role'
  ])

  const bodyChunk = {
    chunkId: 'body',
    documentId: 'energy-03',
    documentName: 'energy_03_complex.pdf',
    content: 'PDF-ENE-03 阈值判定：主控制阈值固定为 50%，责任角色 operations_director。',
    score: 1
  }
  const visualChunk = {
    chunkId: 'visual',
    documentId: 'energy-03',
    documentName: 'energy_03_complex.pdf',
    content: 'VISUAL CONTROL DASHBOARD Record: PDF-ENE-03 ALERT THRESHOLD 75% ACTION CODE ACT-PENE-23',
    score: 1
  }

  assert.ok(computeKnowledgeEvidenceCoverage([visualChunk], plan) < plan.requiredCoverage)
  assert.equal(computeKnowledgeEvidenceCoverage([bodyChunk, visualChunk], plan), 1)
})

test('technical evidence-term queries degrade instead of blocking when partial evidence exists', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'Redis缓存击穿 互斥锁 只允许一个请求查数据库 其他请求等待',
    analysis: {
      intent: 'constrained',
      intentReason: 'technical procedure',
      needsExactMatch: true,
      needsProcedure: false,
      searchPhrases: [
        'Redis缓存击穿 互斥锁',
        '缓存击穿 互斥锁 解决方案',
        '只允许一个请求查数据库 其他请求等待',
        'Redis缓存击穿 互斥锁 实现',
        '缓存击穿 互斥锁 只让一个线程查库'
      ],
      semanticQueries: [],
      requiredTerms: ['Redis', '缓存击穿', '互斥锁', '只允许一个请求查数据库'],
      optionalTerms: ['只允许一个请求', '查数据库', '请求等待', '解决方案', '实现方法'],
      excludedTerms: [],
      entities: [],
      constraints: []
    },
    protectedTerms: ['Redis', '缓存击穿', '互斥锁', '只允许一个请求查数据库'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 8
  })

  const partialCoverage = 0.5

  assert.equal(plan.identifiers.length, 0)
  assert.equal(plan.fieldSlots.length, 0)
  assert.equal(resolveEvidenceGateStatus(partialCoverage, plan), 'degraded')
})
