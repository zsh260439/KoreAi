import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __testResolveRequestedSlots,
  buildCompleteDeterministicFieldAnswer,
  getMissingRequestedEvidenceValues,
  isPureDeterministicFieldQuestion,
  scoreRequestedEvidenceCoverage
} from '../../../modules/knowledge/pipeline/answer-generation/knowledge-qa-answer-validation'

const pdfMfgQuestion =
  'PDF-MFG-01 的主控制阈值和责任角色是什么？附件仪表盘中的预警值与处置代码分别是什么？'

const pdfMfgHits = [
  {
    chunkId: 'visual',
    documentId: 'mfg-01',
    documentName: 'manufacturing_01_complex.pdf',
    content:
      'Record: PDF-MFG-01 ALERT THRESHOLD ACTION CODE ESCALATION WINDOW 79% ACT-PMFG-21 6 hours',
    score: 1
  },
  {
    chunkId: 'body',
    documentId: 'mfg-01',
    documentName: 'manufacturing_01_complex.pdf',
    content:
      'PDF-MFG-01 的主控制阈值为 56%，责任角色为 quality_supervisor。达到阈值后应在 6 小时内完成核验。',
    score: 1
  }
]

test('detects missing dashboard values in multi-field PDF answers', () => {
  const draft = '主控制阈值：56%\n责任角色：quality_supervisor'

  assert.deepEqual(
    getMissingRequestedEvidenceValues(pdfMfgQuestion, draft, pdfMfgHits)
      .map((item) => item.value),
    ['79%', 'ACT-PMFG-21']
  )
})

test('scores repaired multi-field PDF answer higher than partial draft', () => {
  const draft = '主控制阈值：56%\n责任角色：quality_supervisor'
  const repaired =
    '主控制阈值：56%\n责任角色：quality_supervisor\n预警值：79%\n处置代码：ACT-PMFG-21'

  assert.equal(scoreRequestedEvidenceCoverage(draft, pdfMfgQuestion, pdfMfgHits), 2)
  assert.equal(scoreRequestedEvidenceCoverage(repaired, pdfMfgQuestion, pdfMfgHits), 4)
})

test('builds deterministic answer when every requested field has a concrete value', () => {
  const answer = buildCompleteDeterministicFieldAnswer(pdfMfgQuestion, pdfMfgHits)

  assert.equal(
    answer?.answer,
    [
      '主控制阈值：56%',
      '责任角色：quality_supervisor',
      '预警值：79%',
      '处置代码：ACT-PMFG-21'
    ].join('\n')
  )
})

test('does not use generic dashboard threshold as a level-specific alert value', () => {
  const question = 'PDF-MED-03 存在二级预警值吗'
  const hits = [
    {
      chunkId: 'visual',
      documentId: 'med-03',
      documentName: 'healthcare_03_complex.pdf',
      content: 'Record: PDF-MED-03 ALERT THRESHOLD 87% ACTION CODE ACT-PMED-23',
      score: 1
    }
  ]

  assert.deepEqual(getMissingRequestedEvidenceValues(question, '', hits), [])
  assert.equal(scoreRequestedEvidenceCoverage('预警值：87%', question, hits), 0)
  assert.equal(buildCompleteDeterministicFieldAnswer(question, hits), null)
})

test('extracts level-specific alert values only when the evidence label is explicit', () => {
  const question = 'PDF-MED-03 一级预警值和二级预警值分别是什么'
  const hits = [
    {
      chunkId: 'visual',
      documentId: 'med-03',
      documentName: 'healthcare_03_complex.pdf',
      content: 'PDF-MED-03 一级预警值 87% 二级预警值 92%',
      score: 1
    }
  ]

  assert.equal(
    buildCompleteDeterministicFieldAnswer(question, hits)?.answer,
    ['一级预警值：87%', '二级预警值：92%'].join('\n')
  )
})

test('does not use generic or lower-level alert values as tertiary alert value', () => {
  const question = 'TXT-PAY-002 存在三级预警值吗'
  const hits = [
    {
      chunkId: 'visual',
      documentId: 'pay-002',
      documentName: 'txt-pay-002.txt',
      content: 'TXT-PAY-002 一级预警值 60% 二级预警值 78% 预警值 78%',
      score: 1
    }
  ]

  assert.deepEqual(__testResolveRequestedSlots(question), ['alert_threshold_level_3'])
  assert.deepEqual(getMissingRequestedEvidenceValues(question, '', hits), [])
  assert.equal(scoreRequestedEvidenceCoverage('预警值：78%', question, hits), 0)
  assert.equal(buildCompleteDeterministicFieldAnswer(question, hits), null)
})

test('extracts tertiary alert only from explicit tertiary label', () => {
  const question = 'TXT-PAY-002 三级预警值是多少'
  const hits = [
    {
      chunkId: 'visual',
      documentId: 'pay-002',
      documentName: 'txt-pay-002.txt',
      content: 'TXT-PAY-002 三级预警值 91%',
      score: 1
    }
  ]

  assert.equal(
    buildCompleteDeterministicFieldAnswer(question, hits)?.answer,
    '三级预警值：91%'
  )
})

test('supports arbitrary alert levels without falling back to generic alert value', () => {
  const question = 'TXT-PAY-002 四级预警值是多少'
  const hits = [
    {
      chunkId: 'visual',
      documentId: 'pay-002',
      documentName: 'txt-pay-002.txt',
      content: 'TXT-PAY-002 预警值 78% 四级预警值 94%',
      score: 1
    }
  ]

  assert.equal(
    buildCompleteDeterministicFieldAnswer(question, hits)?.answer,
    '四级预警值：94%'
  )
  assert.equal(scoreRequestedEvidenceCoverage('预警值：78%', question, hits), 0)
})

test('does not route arbitrary level-qualified non-alert fields to deterministic QA', () => {
  const question = '六级拦截、3级拦截和八级标志分别是什么'
  const hits = [
    {
      chunkId: 'policy',
      documentId: 'policy-01',
      documentName: 'policy.txt',
      content:
        '六级拦截 BLOCK-L6 3级拦截 BLOCK-L3 八级标志 FLAG-L8 拦截 BLOCK-GENERIC',
      score: 1
    }
  ]

  assert.deepEqual(__testResolveRequestedSlots(question), [])
  assert.equal(buildCompleteDeterministicFieldAnswer(question, hits), null)
  assert.equal(scoreRequestedEvidenceCoverage('拦截：BLOCK-GENERIC', question, hits), 0)
})

test('does not route english generic level fields to deterministic QA', () => {
  const question = 'level6 block 和 level 8 flag 分别是什么'
  const hits = [
    {
      chunkId: 'policy',
      documentId: 'policy-01',
      documentName: 'policy.txt',
      content: 'level 6 block BLOCK-L6 level8flag FLAG-L8 block BLOCK-GENERIC',
      score: 1
    }
  ]

  assert.deepEqual(__testResolveRequestedSlots(question), [])
  assert.equal(buildCompleteDeterministicFieldAnswer(question, hits), null)
  assert.equal(scoreRequestedEvidenceCoverage('block：BLOCK-GENERIC', question, hits), 0)
})

test('does not use deterministic field answer for mixed field and open-ended questions', () => {
  const question =
    'DOCX-LOCK-023 存在三级预警值吗？TXT-ENE-026 描述了什么通用归档模式？'
  const hits = [
    {
      chunkId: 'lock',
      documentId: 'lock-023',
      documentName: 'DOCX-LOCK-023.docx',
      content: 'DOCX-LOCK-023 三级预警值 93%',
      score: 1
    },
    {
      chunkId: 'ene',
      documentId: 'ene-026',
      documentName: 'TXT-ENE-026.txt',
      content:
        'TXT-ENE-026 通用归档模式：每次修改保留旧值、新值、修改原因和审核人。',
      score: 1
    }
  ]

  assert.equal(isPureDeterministicFieldQuestion(question), false)
  assert.equal(buildCompleteDeterministicFieldAnswer(question, hits), null)
})
