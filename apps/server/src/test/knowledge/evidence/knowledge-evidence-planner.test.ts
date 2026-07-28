import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildKnowledgeQueryEvidencePlan,
  computeKnowledgeEvidenceCoverage,
  hasKnowledgeEvidenceRequirements,
  resolveEvidenceGateStatus
} from '../../../modules/knowledge/pipeline/evidence-gating/knowledge-evidence-planner'

test('multi-field exact lookup extracts field slots instead of evidence keyword noise', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'MD-QLT-01 的主控制阈值、责任角色和响应时限分别是什么',
    analysis: null,
    scopeTerms: ['MD-QLT-01'],
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
    scopeTerms: [],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.equal(hasKnowledgeEvidenceRequirements(plan), false)
})

test('plain Chinese aliases map to control threshold and owner slots', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-CLD-01 这条记录的管控线和负责人帮我捞一下',
    analysis: null,
    scopeTerms: ['PDF-CLD-01'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, [
    'main_control_threshold',
    'responsible_role'
  ])
  assert.deepEqual(plan.evidenceTerms, [])
})

test('plain confirmation wording maps to threshold and owner slots', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: '我只看 PDF-CLD-02，主阈值是多少，归谁确认',
    analysis: null,
    scopeTerms: ['PDF-CLD-02'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, [
    'main_control_threshold',
    'responsible_role'
  ])
})

test('visual dashboard aliases map to alert threshold and action code slots', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: '这份 PDF-ENE-01 的附件看板里，预警线和动作码分别是多少',
    analysis: null,
    scopeTerms: ['PDF-ENE-01'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, [
    'alert_threshold',
    'action_code'
  ])
  assert.deepEqual(plan.evidenceTerms, [])
})

test('plain time wording maps to response time slot', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-CLD-03 触发以后多久内要处理完',
    analysis: null,
    scopeTerms: ['PDF-CLD-03'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, ['response_time'])
  assert.deepEqual(plan.evidenceTerms, [])
})

test('field-value lookup requires concrete value near the field label', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-SEC-03 的处置代码是',
    analysis: null,
    scopeTerms: ['PDF-SEC-03'],
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
    scopeTerms: ['PDF-ENE-03'],
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

test('real Chinese PDF query extracts body and dashboard field slots', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery:
      'PDF-MFG-01 的主控制阈值和责任角色是什么？附件仪表盘中的预警值与处置代码分别是什么？',
    analysis: null,
    scopeTerms: ['PDF-MFG-01'],
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
})

test('field-name listing does not request concrete field-value slots', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-MED-03\u6587\u6863\u91cc\u51fa\u73b0\u4e86\u9884\u8b66\u9608\u503c\u3001\u5904\u7f6e\u4ee3\u7801\u8fd9\u4e24\u4e2a\u5b57\u6bb5\u540d\u79f0\uff0c\u8bf7\u7f57\u5217\u51fa\u6765\u3002',
    analysis: null,
    scopeTerms: ['PDF-MED-03'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, [])
})

test('colloquial visual aliases map to alert and action field slots', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-MED-03\u4eea\u8868\u76d8\u544a\u8b66\u4e34\u754c\u70b9\u5bf9\u5e94\u7684\u6570\u5b57\u662f\u591a\u5c11\uff0c\u914d\u5957\u6267\u884c\u7f16\u53f7\u662f\u4ec0\u4e48\uff1f',
    analysis: null,
    scopeTerms: ['PDF-MED-03'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.equal(plan.fieldSlots.includes('alert_threshold'), true)
  assert.equal(plan.fieldSlots.includes('action_code'), true)
})

test('level-specific alert requests do not inflate generic alert coverage', () => {
  const plan = buildKnowledgeQueryEvidencePlan({
    normalizedQuery: 'PDF-MED-03\u4eea\u8868\u76d8\u4e00\u7ea7\u9884\u8b66\u503c\u3001\u4e8c\u7ea7\u9884\u8b66\u503c\u5206\u522b\u662f\u4ec0\u4e48\uff1f',
    analysis: null,
    scopeTerms: ['PDF-MED-03'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 4
  })

  assert.deepEqual(plan.fieldSlots, [
    'alert_threshold_level_1',
    'alert_threshold_level_2'
  ])

  assert.ok(computeKnowledgeEvidenceCoverage([
    {
      chunkId: 'visual',
      documentId: 'med-03',
      documentName: 'healthcare_03_complex.pdf',
      content: 'Record: PDF-MED-03 ALERT THRESHOLD 87% ACTION CODE ACT-PMED-23',
      score: 1
    }
  ], plan) < plan.requiredCoverage)
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
    scopeTerms: ['Redis', '缓存击穿', '互斥锁', '只允许一个请求查数据库'],
    optionalTerms: [],
    excludedTerms: [],
    requestedTopK: 8
  })

  const partialCoverage = 0.5

  assert.equal(plan.identifiers.length, 0)
  assert.equal(plan.fieldSlots.length, 0)
  assert.equal(resolveEvidenceGateStatus(partialCoverage, plan), 'degraded')
})

