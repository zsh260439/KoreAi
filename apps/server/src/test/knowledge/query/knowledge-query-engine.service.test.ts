import assert from 'node:assert/strict'
import test from 'node:test'

import { DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG } from 'share-type'

import type { KnowledgeQueryAnalysisService } from '../../../modules/knowledge/pipeline/query-understanding/knowledge-query-analysis.service'
import { KnowledgeQueryEngineService } from '../../../modules/knowledge/pipeline/query-understanding/knowledge-query-engine.service'

const analysisService = {
  analyze: async () => {
    throw new Error('analysis should not run in these rule-level tests')
  }
} as unknown as KnowledgeQueryAnalysisService

test('explicit structured query drops conflicting memory retrieval hints', async () => {
  const service = new KnowledgeQueryEngineService(analysisService)
  const plan = await service.buildPlan(
    'PDF-ENE-03 的主控制阈值和责任角色是什么？附件仪表盘中的预警值与处置代码分别是什么？',
    {
      enableAnalysis: false,
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
      retrievalHints: [
        'DOCX-ENE-02',
        'energy_02_complex.docx',
        'risk_lead',
        '版本与归档'
      ]
    }
  )

  assert.deepEqual(plan.retrievalHintTerms, [])
  assert.deepEqual(plan.droppedRetrievalHintTerms, [
    'DOCX-ENE-02',
    'energy_02_complex.docx',
    'risk_lead',
    '版本与归档'
  ])
  assert.equal(plan.retrievalHintConflict, true)
  assert.equal(plan.bm25Query.includes('DOCX-ENE-02'), false)
  assert.equal(plan.bm25Query.includes('energy_02_complex.docx'), false)
  assert.equal(plan.bm25Query.includes('risk_lead'), false)
})

test('ambiguous follow-up keeps memory retrieval hints when no new identifier exists', async () => {
  const service = new KnowledgeQueryEngineService(analysisService)
  const plan = await service.buildPlan('他的处置代码呢?', {
    enableAnalysis: false,
    runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
    retrievalHints: [
      'PDF-SEC-03',
      'security_03_complex.pdf',
      'VISUAL CONTROL DASHBOARD'
    ]
  })

  assert.deepEqual(plan.retrievalHintTerms, [
    'PDF-SEC-03',
    'security_03_complex.pdf',
    'VISUAL CONTROL DASHBOARD'
  ])
  assert.deepEqual(plan.droppedRetrievalHintTerms, [])
  assert.equal(plan.retrievalHintConflict, false)
  assert.equal(plan.bm25Query.includes('PDF-SEC-03'), true)
  assert.equal(plan.bm25Query.includes('security_03_complex.pdf'), true)
})

test('bm25 query debug removes normalized duplicate phrases', async () => {
  const service = new KnowledgeQueryEngineService({
    analyze: async () => ({
      intent: 'precise',
      intentReason: 'test duplicate terms',
      needsExactMatch: true,
      needsProcedure: false,
      searchPhrases: ['cache_breakdown.md　处置代码', 'cache_breakdown'],
      semanticQueries: [],
      requiredTerms: ['cache_breakdown.md 处置代码'],
      optionalTerms: [],
      excludedTerms: [],
      entities: [],
      constraints: []
    })
  } as unknown as KnowledgeQueryAnalysisService)

  const plan = await service.buildPlan('cache_breakdown.md 处置代码', {
    enableAnalysis: true,
    runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG
  })

  assert.equal(countOccurrences(plan.bm25Query, 'cache_breakdown.md 处置代码'), 1)
  assert.equal(plan.bm25Query.includes('cache_breakdown'), true)
})

test('forced rewrite bypasses analysis for explicit structured field lookups', async () => {
  const service = new KnowledgeQueryEngineService(analysisService)
  const plan = await service.buildPlan(
    'PDF-FIN-01 \u7684\u4e3b\u63a7\u5236\u9608\u503c\u548c\u8d23\u4efb\u89d2\u8272\u662f\u4ec0\u4e48\uff1f\u9644\u4ef6\u4eea\u8868\u76d8\u4e2d\u7684\u9884\u8b66\u503c\u4e0e\u5904\u7f6e\u4ee3\u7801\u5206\u522b\u662f\u4ec0\u4e48\uff1f',
    {
      enableAnalysis: true,
      forceAnalysis: true,
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG
    }
  )

  assert.equal(plan.rewriteApplied, false)
  assert.equal(plan.executionProfile.userIntent, 'fact_lookup')
  assert.equal(plan.executionProfile.scopeMode, 'explicit_single')
  assert.equal(plan.evidencePlan.fieldSlots.includes('main_control_threshold'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('responsible_role'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('alert_threshold'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('action_code'), true)
})

test('colloquial multi-field lookup bypasses forced rewrite', async () => {
  const service = new KnowledgeQueryEngineService(analysisService)
  const plan = await service.buildPlan(
    '写出PDF-MED-03主控阈值、责任人、仪表盘一级预警值、二级预警值、处置编码、动作代码全部内容。',
    {
      enableAnalysis: true,
      forceAnalysis: true,
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG
    }
  )

  assert.equal(plan.rewriteApplied, false)
  assert.equal(plan.evidencePlan.fieldSlots.includes('main_control_threshold'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('responsible_role'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('alert_threshold_level_1'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('alert_threshold_level_2'), true)
  assert.equal(plan.evidencePlan.fieldSlots.includes('alert_threshold'), false)
  assert.equal(plan.evidencePlan.fieldSlots.includes('action_code'), true)
})

test('explicit multi-object commonality query keeps filename hints and drops task-only terms', async () => {
  const service = new KnowledgeQueryEngineService({
    analyze: async () => ({
      intent: 'constrained',
      intentReason: 'commonality query across explicit objects',
      needsExactMatch: true,
      needsProcedure: false,
      searchPhrases: ['PDF-ENE-01 PDF-SEC-01 cache_breakdown.md 共同点'],
      semanticQueries: [],
      requiredTerms: ['共性', '共同点'],
      optionalTerms: [],
      excludedTerms: [],
      entities: [
        { text: 'PDF-ENE-01', canonicalForm: 'PDF-ENE-01', kind: 'identifier' },
        { text: 'PDF-SEC-01', canonicalForm: 'PDF-SEC-01', kind: 'identifier' },
        { text: 'cache_breakdown.md', canonicalForm: 'cache_breakdown.md', kind: 'identifier' }
      ],
      constraints: []
    })
  } as unknown as KnowledgeQueryAnalysisService)

  const plan = await service.buildPlan(
    '请基于 PDF-ENE-01、PDF-SEC-01、cache_breakdown.md 回答：那他们具有什么共性吗',
    {
      enableAnalysis: true,
      runtimeConfig: DEFAULT_KNOWLEDGE_BASE_RUNTIME_CONFIG,
      retrievalHints: [
        'PDF-ENE-01',
        'PDF-SEC-01',
        'cache_breakdown.md',
        'energy_01_complex.pdf'
      ]
    }
  )

  assert.equal(plan.retrievalHintTerms.includes('cache_breakdown.md'), true)
  assert.equal(plan.droppedRetrievalHintTerms.includes('cache_breakdown.md'), false)
  assert.equal(plan.scopeTerms.includes('共性'), false)
  assert.equal(plan.scopeTerms.includes('共同点'), false)
  assert.equal(plan.evidencePlan.evidenceTerms.includes('共性'), false)
  assert.equal(plan.evidencePlan.evidenceTerms.includes('共同点'), false)
})

function countOccurrences(value: string, term: string): number {
  return value.split(term).length - 1
}
