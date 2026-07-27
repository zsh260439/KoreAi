import assert from 'node:assert/strict'
import test from 'node:test'

import type { WorkspaceMessage } from 'share-type'

import type { KnowledgeConfigService } from '../../../modules/knowledge/runtime/config/knowledge-config.service'
import { WorkspaceChatMemoryService } from '../../../modules/workspace/chat/workspace-chat-memory.service'

const configService = {
  findProviderSettings: async () => ({
    runtimeConfig: {
      llm: {
        baseUrl: null,
        model: null
      }
    }
  })
} as unknown as KnowledgeConfigService

test('explicit document query recalls only matching scoped memory facts', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'DOCX-ENE-02 的处置代码是什么?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.equal(resolution.intent, 'new_question')
  assert.equal(resolution.retrievalHints.includes('DOCX-ENE-02'), true)
  assert.equal(resolution.retrievalHints.includes('energy_02_complex.docx'), true)
  assert.equal(resolution.retrievalHints.includes('VISUAL CONTROL DASHBOARD'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), false)
})

test('explicit new document query does not attach unrelated memory facts', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'PDF-ENE-04 的主控制阈值和责任角色是什么?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.deepEqual(resolution.retrievalHints, [])
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), false)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), false)
})

test('ambiguous follow-up inherits the latest cited document scope', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'that action code?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.equal(resolution.retrievalHints.includes('PDF-ENE-03'), true)
  assert.equal(resolution.retrievalHints.includes('energy_03_complex.pdf'), true)
  assert.equal(resolution.retrievalHints.includes('VISUAL CONTROL DASHBOARD'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), false)
})

test('technical topic follow-up recalls local memory facts before LLM resolution', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '有没有一个方法，只让一个请求去查数据库，其他请求先等着?',
    messages: [
      userMessage('能不能只让一个请求去查数据库，其他请求先等着?'),
      assistantMessage(
        '互斥锁重建方案：只允许获得锁的请求查询数据库并回填缓存，其他请求等待后重试。',
        'cache_breakdown.md',
        'Redis 缓存击穿处理规范。首选方案是互斥锁重建：只允许获得锁的请求查询数据库并回填缓存，其他请求等待后重试。'
      )
    ],
    conversationTitle: 'redis cache breakdown'
  })

  assert.equal(resolution.intent, 'new_question')
  assert.equal(resolution.memoryBoardSource, 'local')
  assert.equal(resolution.applied, true)
  assert.equal(resolution.retrievalHints.includes('cache_breakdown.md'), true)
  assert.equal(resolution.groundedQuery.includes('cache_breakdown.md'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('互斥锁重建方案'), true)
})

test('explicit object memory debug records selected and dropped entries', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'PDF-ENE-03 action code?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.equal(resolution.retrievalHints.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryMatchDebug?.selected.some((item) =>
    item.documentName === 'energy_03_complex.pdf' && item.reason === 'explicit_object'
  ), true)
  assert.equal(resolution.memoryMatchDebug?.dropped.some((item) =>
    item.documentName === 'energy_02_complex.docx'
  ), true)
})

test('explicit object matching normalizes id separators and casing', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'pdf_ene_03 action code?',
    messages: buildHistory(),
    conversationTitle: 'energy review'
  })

  assert.equal(resolution.retrievalHints.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryBoardSummary?.includes('DOCX-ENE-02'), false)
})

test('multi-object follow-up keeps latest cited documents instead of only the first one', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'their action codes respectively?',
    messages: [
      userMessage('Compare PDF-ENE-02 and PDF-ENE-03.'),
      assistantMessageWithCitations('PDF-ENE-02 and PDF-ENE-03 were compared.', [
        {
          documentName: 'energy_02_complex.pdf',
          content: 'Record: PDF-ENE-02 ACTION CODE ACT-PENE-22'
        },
        {
          documentName: 'energy_03_complex.pdf',
          content: 'Record: PDF-ENE-03 ACTION CODE ACT-PENE-23'
        }
      ])
    ],
    conversationTitle: 'energy comparison'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.retrievalHints.includes('PDF-ENE-02'), true)
  assert.equal(resolution.retrievalHints.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryMatchDebug?.selected.length, 2)
})

test('ordinal follow-up uses citation mention order for the former document', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '前者的处置代码是什么？',
    messages: [
      userMessage('Compare PDF-ENE-02 and PDF-ENE-03.'),
      assistantMessageWithCitations('PDF-ENE-02 and PDF-ENE-03 were compared.', [
        {
          documentName: 'energy_02_complex.pdf',
          content: 'Record: PDF-ENE-02 ACTION CODE ACT-PENE-22'
        },
        {
          documentName: 'energy_03_complex.pdf',
          content: 'Record: PDF-ENE-03 ACTION CODE ACT-PENE-23'
        }
      ])
    ],
    conversationTitle: 'energy comparison'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.deepEqual(resolution.retrievalHints.filter((hint) => /^PDF-ENE-0[23]$/.test(hint)), [
    'PDF-ENE-02'
  ])
  assert.equal(resolution.memoryMatchDebug?.selected[0]?.mentionOrder, 10)
})

test('ordinal follow-up uses citation mention order for the latter document', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '后者的处置代码是什么？',
    messages: [
      userMessage('Compare PDF-ENE-02 and PDF-ENE-03.'),
      assistantMessageWithCitations('PDF-ENE-02 and PDF-ENE-03 were compared.', [
        {
          documentName: 'energy_02_complex.pdf',
          content: 'Record: PDF-ENE-02 ACTION CODE ACT-PENE-22'
        },
        {
          documentName: 'energy_03_complex.pdf',
          content: 'Record: PDF-ENE-03 ACTION CODE ACT-PENE-23'
        }
      ])
    ],
    conversationTitle: 'energy comparison'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.deepEqual(resolution.retrievalHints.filter((hint) => /^PDF-ENE-0[23]$/.test(hint)), [
    'PDF-ENE-03'
  ])
  assert.equal(resolution.memoryMatchDebug?.selected[0]?.mentionOrder, 11)
})

test('multi-object follow-up grounds only record ids and documents, not prior fact values', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'their action codes respectively?',
    messages: [
      userMessage('PDF-ENE-02的处置代码是啥'),
      assistantMessage(
        'ACT-PENE-22',
        'energy_02_complex.pdf',
        'Record: PDF-ENE-02 ACTION CODE ACT-PENE-22'
      ),
      userMessage('PDF-ENE-03的处置代码呢'),
      assistantMessage(
        'ACT-PENE-23',
        'energy_03_complex.pdf',
        'Record: PDF-ENE-03 ACTION CODE ACT-PENE-23'
      )
    ],
    conversationTitle: 'energy action codes'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.groundedQuery.includes('PDF-ENE-02'), true)
  assert.equal(resolution.groundedQuery.includes('PDF-ENE-03'), true)
  assert.equal(resolution.groundedQuery.includes('ACT-PENE-22'), false)
  assert.equal(resolution.groundedQuery.includes('ACT-PENE-23'), false)
  assert.equal(resolution.memoryMatchDebug?.selected.length, 2)
})

test('multi-object follow-up uses recent same-family window for consecutive single-document turns', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'their action codes respectively?',
    messages: [
      userMessage('PDF-ENE-01 的主控制阈值是什么？'),
      assistantMessage(
        '主控制阈值：46%',
        'energy_01_complex.pdf',
        'Record: PDF-ENE-01 ACTION CODE ACT-PENE-21'
      ),
      userMessage('PDF-ENE-02 的主控制阈值是什么？'),
      assistantMessage(
        '主控制阈值：47%',
        'energy_02_complex.pdf',
        'Record: PDF-ENE-02 ACTION CODE ACT-PENE-22'
      ),
      userMessage('PDF-ENE-03 的主控制阈值是什么？'),
      assistantMessage(
        '主控制阈值：50%',
        'energy_03_complex.pdf',
        'Record: PDF-ENE-03 ACTION CODE ACT-PENE-23'
      )
    ],
    conversationTitle: 'energy series'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.retrievalHints.includes('PDF-ENE-01'), true)
  assert.equal(resolution.retrievalHints.includes('PDF-ENE-02'), true)
  assert.equal(resolution.retrievalHints.includes('PDF-ENE-03'), true)
  assert.equal(resolution.memoryMatchDebug?.selected.every((item) =>
    item.reason === 'recent_same_family_window'
  ), true)
})

test('same-family window is invalidated by an unrelated document in between', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'their action codes respectively?',
    messages: [
      userMessage('PDF-ENE-01 threshold?'),
      assistantMessage(
        '44%',
        'energy_01_complex.pdf',
        'Record: PDF-ENE-01 ACTION CODE ACT-PENE-21'
      ),
      userMessage('PDF-ENE-02 threshold?'),
      assistantMessage(
        '47%',
        'energy_02_complex.pdf',
        'Record: PDF-ENE-02 ACTION CODE ACT-PENE-22'
      ),
      userMessage('Vue manual summary?'),
      assistantMessage(
        'Vue manual.',
        'vue_manual.md',
        'Vue development manual'
      ),
      userMessage('PDF-ENE-03 threshold?'),
      assistantMessage(
        '50%',
        'energy_03_complex.pdf',
        'Record: PDF-ENE-03 ACTION CODE ACT-PENE-23'
      )
    ],
    conversationTitle: 'interleaved energy series'
  })

  assert.deepEqual(resolution.retrievalHints, [])
  assert.equal(resolution.directAnswer?.includes('不直接猜范围'), true)
  assert.equal(resolution.memoryClarificationCandidates?.length, 4)
  assert.equal(resolution.memoryMatchDebug?.selected.length, 0)
})

test('ordinal follow-up can select a non-family document by mention order', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '第二个文档讲什么？',
    messages: buildMixedThreeDocumentHistory(),
    conversationTitle: 'mixed operational docs'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.retrievalHints.includes('alarm_manual.md'), true)
  assert.equal(resolution.retrievalHints.includes('ops_spec.pdf'), false)
  assert.equal(resolution.retrievalHints.includes('inspection_rules.docx'), false)
})

test('range ordinal follow-up selects the first two non-family documents by mention order', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '前两者的差异是什么？',
    messages: buildMixedThreeDocumentHistory(),
    conversationTitle: 'mixed operational docs'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.retrievalHints.includes('ops_spec.pdf'), true)
  assert.equal(resolution.retrievalHints.includes('alarm_manual.md'), true)
  assert.equal(resolution.retrievalHints.includes('inspection_rules.docx'), false)
})

test('multi-object follow-up does not default to all history when recent objects are mixed', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'their action codes respectively?',
    messages: [
      userMessage('PDF-ENE-01 的主控制阈值是什么？'),
      assistantMessage(
        '主控制阈值：46%',
        'energy_01_complex.pdf',
        'Record: PDF-ENE-01 ACTION CODE ACT-PENE-21'
      ),
      userMessage('PDF-SEC-01 的主控制阈值是什么？'),
      assistantMessage(
        '主控制阈值：64%',
        'security_01_complex.pdf',
        'Record: PDF-SEC-01 ACTION CODE ACT-PSEC-21'
      ),
      userMessage('cache_breakdown.md 讲什么？'),
      assistantMessage(
        '缓存击穿说明。',
        'cache_breakdown.md',
        'Redis 缓存击穿处理规范。'
      )
    ],
    conversationTitle: 'mixed scope'
  })

  assert.deepEqual(resolution.retrievalHints, [])
  assert.equal(resolution.directAnswer?.includes('不直接猜范围'), true)
  assert.equal(resolution.memoryClarificationCandidates?.length, 3)
  assert.equal(resolution.memoryMatchDebug?.selected.length, 0)
  assert.equal(resolution.memoryMatchDebug?.dropped.length, 3)
})

test('ambiguous multi-object follow-up stops before LLM fallback when history is mixed', async () => {
  const service = new WorkspaceChatMemoryService({
    findProviderSettings: async () => ({
      runtimeConfig: {
        llm: {
          baseUrl: 'http://memory-resolver.test',
          model: 'memory-test-model'
        }
      }
    })
  } as unknown as KnowledgeConfigService)
  let llmInvoked = false
  ;(service as unknown as { createClient: () => Promise<{ invoke: () => Promise<{ content: string }> }> }).createClient = async () => ({
    invoke: async () => {
      llmInvoked = true
      return {
        content: JSON.stringify({
          intent: 'followup_question',
          groundedQuery: '它们的处置代码分别是什么？ cache_breakdown.md',
          directAnswer: null,
          scopeSummary: null,
          memoryBoard: null,
          retrievalHints: ['cache_breakdown.md']
        })
      }
    }
  })

  const resolution = await service.resolveChatMemory({
    query: '它们的处置代码分别是什么？',
    messages: [
      userMessage('PDF-ENE-01 的主控制阈值是什么？'),
      assistantMessage(
        '44%',
        'energy_01_complex.pdf',
        'Record: PDF-ENE-01 ACTION CODE ACT-PENE-21'
      ),
      userMessage('PDF-SEC-01 的责任角色是什么？'),
      assistantMessage(
        'service_commander',
        'security_01_complex.pdf',
        'Record: PDF-SEC-01 ACTION CODE ACT-PSEC-21'
      ),
      userMessage('cache_breakdown.md 讲的是什么？'),
      assistantMessage(
        'Redis 缓存击穿处理规范。',
        'cache_breakdown.md',
        'Redis 缓存击穿处理规范。'
      )
    ],
    conversationTitle: 'mixed scope'
  })

  assert.equal(llmInvoked, false)
  assert.equal(resolution.intent, 'followup_question')
  assert.deepEqual(resolution.retrievalHints, [])
  assert.equal(resolution.groundedQuery, '它们的处置代码分别是什么？')
  assert.equal(resolution.memoryMatchDebug?.selected.length, 0)
})

test('numeric range follow-up selects at most eight ordered memory objects', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: 'compare 1~15 action codes',
    messages: buildManyDocumentHistory(15),
    conversationTitle: 'many documents'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.memoryClarificationCandidates?.length ?? 0, 0)
  assert.equal(resolution.memoryMatchDebug?.selected.length, 8)
  const selectedIdentifiers = resolution.memoryMatchDebug?.selected.flatMap((item) => item.identifiers) ?? []
  assert.equal(selectedIdentifiers.includes('PDF-ENE-01'), true)
  assert.equal(selectedIdentifiers.includes('PDF-ENE-08'), true)
  assert.equal(selectedIdentifiers.includes('PDF-ENE-09'), false)
})

test('tail range follow-up can wake dormant ordered memory objects', async () => {
  const service = new WorkspaceChatMemoryService(configService)
  const resolution = await service.resolveChatMemory({
    query: '最后8个文档的 action codes respectively?',
    messages: buildManyDocumentHistory(12),
    conversationTitle: 'many documents'
  })

  assert.equal(resolution.intent, 'followup_question')
  assert.equal(resolution.memoryMatchDebug?.selected.length, 8)
  const selectedIdentifiers = resolution.memoryMatchDebug?.selected.flatMap((item) => item.identifiers) ?? []
  assert.equal(selectedIdentifiers.includes('PDF-ENE-05'), true)
  assert.equal(selectedIdentifiers.includes('PDF-ENE-12'), true)
  assert.equal(selectedIdentifiers.includes('PDF-ENE-04'), false)
})

function buildHistory(): WorkspaceMessage[] {
  return [
    userMessage('DOCX-ENE-02 的主控制阈值和责任角色是什么?'),
    assistantMessage(
      '主控制阈值：48%\n责任角色：risk_lead\n预警值：75%\n处置代码：ACT-DENE-22',
      'energy_02_complex.docx',
      'DOCX-ENE-02 VISUAL CONTROL DASHBOARD ALERT THRESHOLD 75% ACTION CODE ACT-DENE-22'
    ),
    userMessage('PDF-ENE-03 的主控制阈值和责任角色是什么?'),
    assistantMessage(
      '主控制阈值：50%\n责任角色：operations_director\n预警值：75%\n处置代码：ACT-PENE-23',
      'energy_03_complex.pdf',
      'PDF-ENE-03 VISUAL CONTROL DASHBOARD ALERT THRESHOLD 75% ACTION CODE ACT-PENE-23'
    )
  ]
}

function buildManyDocumentHistory(count: number): WorkspaceMessage[] {
  const messages: WorkspaceMessage[] = []
  for (let index = 1; index <= count; index += 1) {
    const id = `PDF-ENE-${String(index).padStart(2, '0')}`
    messages.push(
      userMessage(`${id} action code?`),
      assistantMessage(
        `ACT-PENE-${String(20 + index).padStart(2, '0')}`,
        `energy_${String(index).padStart(2, '0')}_complex.pdf`,
        `Record: ${id} ACTION CODE ACT-PENE-${String(20 + index).padStart(2, '0')}`
      )
    )
  }

  return messages
}

function buildMixedThreeDocumentHistory(): WorkspaceMessage[] {
  return [
    userMessage('ops_spec.pdf summary?'),
    assistantMessage(
      'Operations spec.',
      'ops_spec.pdf',
      'Operations specification document'
    ),
    userMessage('alarm_manual.md summary?'),
    assistantMessage(
      'Alarm manual.',
      'alarm_manual.md',
      'Alarm handling manual'
    ),
    userMessage('inspection_rules.docx summary?'),
    assistantMessage(
      'Inspection rules.',
      'inspection_rules.docx',
      'Machine room inspection rules'
    )
  ]
}

function userMessage(content: string): WorkspaceMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conversation-id',
    role: 'user',
    content,
    citations: null,
    retrievalDebug: null,
    model: null,
    latencyMs: null,
    totalTokens: null,
    reasoningSteps: null,
    promptCapabilities: null,
    createdAt: new Date().toISOString()
  }
}

function assistantMessageWithCitations(
  content: string,
  citations: Array<{ documentName: string; content: string }>
): WorkspaceMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conversation-id',
    role: 'assistant',
    content,
    citations: citations.map((citation, index) => ({
      chunkId: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      documentName: citation.documentName,
      content: citation.content,
      score: 100 - index,
      sequence: index + 1,
      sectionPath: 'VISUAL CONTROL DASHBOARD',
      primaryTitle: 'VISUAL CONTROL DASHBOARD',
      scoreDetail: {
        matchedBy: ['bm25'],
        bm25Score: 100 - index,
        vectorScore: null,
        fusedScore: 100 - index
      }
    })),
    retrievalDebug: null,
    model: 'test-model',
    latencyMs: 100,
    totalTokens: 100,
    reasoningSteps: null,
    promptCapabilities: null,
    createdAt: new Date().toISOString()
  }
}

function assistantMessage(
  content: string,
  documentName: string,
  citationContent: string
): WorkspaceMessage {
  return {
    id: crypto.randomUUID(),
    conversationId: 'conversation-id',
    role: 'assistant',
    content,
    citations: [
      {
        chunkId: crypto.randomUUID(),
        documentId: crypto.randomUUID(),
        documentName,
        content: citationContent,
        score: 100,
        sequence: 1,
        sectionPath: 'VISUAL CONTROL DASHBOARD',
        primaryTitle: 'VISUAL CONTROL DASHBOARD',
        scoreDetail: {
          matchedBy: ['bm25'],
          bm25Score: 100,
          vectorScore: null,
          fusedScore: 100
        }
      }
    ],
    retrievalDebug: null,
    model: 'test-model',
    latencyMs: 100,
    totalTokens: 100,
    reasoningSteps: null,
    promptCapabilities: null,
    createdAt: new Date().toISOString()
  }
}
