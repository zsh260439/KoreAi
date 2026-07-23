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
