import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCompleteDeterministicFieldAnswer,
  getMissingRequestedEvidenceValues,
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
      '\u4e3b\u63a7\u5236\u9608\u503c\uff1a56%',
      '\u8d23\u4efb\u89d2\u8272\uff1aquality_supervisor',
      '\u9884\u8b66\u503c\uff1a79%',
      '\u5904\u7f6e\u4ee3\u7801\uff1aACT-PMFG-21'
    ].join('\n')
  )
})

test('does not use generic dashboard threshold as a level-specific alert value', () => {
  const question = 'PDF-MED-03\u5b58\u5728\u4e8c\u7ea7\u9884\u8b66\u503c\u5417'
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
  assert.equal(scoreRequestedEvidenceCoverage('\u9884\u8b66\u503c\uff1a87%', question, hits), 0)
  assert.equal(buildCompleteDeterministicFieldAnswer(question, hits), null)
})

test('extracts level-specific alert values only when the evidence label is explicit', () => {
  const question = 'PDF-MED-03\u4e00\u7ea7\u9884\u8b66\u503c\u548c\u4e8c\u7ea7\u9884\u8b66\u503c\u5206\u522b\u662f\u4ec0\u4e48'
  const hits = [
    {
      chunkId: 'visual',
      documentId: 'med-03',
      documentName: 'healthcare_03_complex.pdf',
      content: 'PDF-MED-03 \u4e00\u7ea7\u9884\u8b66\u503c 87% \u4e8c\u7ea7\u9884\u8b66\u503c 92%',
      score: 1
    }
  ]

  assert.equal(
    buildCompleteDeterministicFieldAnswer(question, hits)?.answer,
    ['\u4e00\u7ea7\u9884\u8b66\u503c\uff1a87%', '\u4e8c\u7ea7\u9884\u8b66\u503c\uff1a92%'].join('\n')
  )
})
