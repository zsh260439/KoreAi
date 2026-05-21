import type {
  ChatMessage,
  ConversationSummary,
  DashboardData,
  IntentNode,
  KnowledgeBase,
  KnowledgeDocumentChunkLog,
  KnowledgeDocumentUpdatePayload,
  KnowledgeDocumentUploadPayload,
  KnowledgeDocument,
  McpServer,
  PipelineTask,
  PromptStrategy,
  ProviderConfig,
  QueryMapping,
  RetrievalCitation,
  SampleQuestion,
  SearchSuggestionGroup,
  SystemSettings,
  TraceDetail,
  TraceSummary,
  User
} from '@/types/models'

export async function wait(ms = 350) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function cloneMock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createDocumentId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function inferFileTypeFromName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || 'file'
  return ext
}

function inferDisplayType(fileType: string) {
  return fileType.toUpperCase()
}

function buildChunkConfig(
  mode: KnowledgeDocument['processMode'],
  strategy: string | undefined,
  current?: string
) {
  if (current) return current
  if (mode === 'pipeline') return ''
  if (strategy === 'fixed_size') {
    return JSON.stringify({
      chunkSize: 512,
      overlapSize: 128
    })
  }
  return JSON.stringify({
    targetChars: 1400,
    maxChars: 1800,
    minChars: 600,
    overlapChars: 0
  })
}

export const currentUser: User = {
  id: 'user-001',
  name: '陈若衡',
  email: 'admin@demo.ai',
  role: '平台管理员',
  status: 'active',
  lastActive: '2026-05-17 15:20'
}

export const conversationSummaries: ConversationSummary[] = [
  {
    id: 'session-finance',
    title: '差旅报销规则问答',
    updatedAt: '2026-05-17 14:40',
    messageCount: 6,
    model: 'doubao-seed-2-0-lite-260215',
    description: '围绕报销制度、发票要求和补贴标准进行问答'
  },
  {
    id: 'session-weather',
    title: '上海会务天气提醒',
    updatedAt: '2026-05-17 13:15',
    messageCount: 4,
    model: 'doubao-seed-2-0-lite-260215',
    description: '联动天气工具和时间工具，给出会议建议'
  },
  {
    id: 'session-support',
    title: '本周用户问题总结',
    updatedAt: '2026-05-16 18:05',
    messageCount: 5,
    model: 'doubao-seed-2-0-lite-260215',
    description: '总结客服热点问题并输出处理建议'
  },
  {
    id: 'session-empty',
    title: '新建会话',
    updatedAt: '2026-05-17 15:00',
    messageCount: 0,
    model: 'doubao-seed-2-0-lite-260215'
  }
]

const financeCitations: RetrievalCitation[] = [
  {
    id: 'cite-fin-1',
    title: '差旅报销制度（2026 版）',
    documentName: 'finance-travel-policy-v2026.pdf',
    chunkIndex: 12,
    content: '高铁二等座、经济舱与市内交通可报销；超过标准需直属主管审批并补充说明。',
    score: 0.94
  },
  {
    id: 'cite-fin-2',
    title: '发票与附件要求',
    documentName: 'expense-attachments-checklist.docx',
    chunkIndex: 4,
    content: '住宿报销需上传行程单、发票、支付凭证；打车需提供电子发票与起终点说明。',
    score: 0.9
  }
]

const financeTraceSummary: TraceSummary = {
  id: 'trace-finance-001',
  traceId: 'trace-finance-001',
  traceName: '财务制度差旅报销问答',
  question: '根据文档回答差旅报销规则，尤其是住宿和交通',
  route: 'knowledge-base-rag',
  conversationId: 'session-finance',
  taskId: 'rag-task-fin-001',
  userId: 'user-001',
  userName: '陈若衡',
  username: '陈若衡',
  toolCount: 1,
  model: 'doubao-seed-2-0-lite-260215',
  inputTokens: 1820,
  outputTokens: 436,
  latencyMs: 2480,
  durationMs: 2480,
  status: 'success',
  createdAt: '2026-05-17 14:40',
  startTime: '2026-05-17 14:40'
}

const weatherTraceSummary: TraceSummary = {
  id: 'trace-weather-002',
  traceId: 'trace-weather-002',
  traceName: '上海天气会务提醒',
  question: '帮我查一下上海明天下午的天气，如果下雨提醒我改成线上会议',
  route: 'tool-call',
  conversationId: 'session-weather',
  taskId: 'tool-task-weather-002',
  userId: 'user-001',
  userName: '陈若衡',
  username: '陈若衡',
  toolCount: 2,
  model: 'doubao-seed-2-0-lite-260215',
  inputTokens: 620,
  outputTokens: 212,
  latencyMs: 1820,
  durationMs: 1820,
  status: 'success',
  createdAt: '2026-05-17 13:15',
  startTime: '2026-05-17 13:15'
}

export const conversationMessages: Record<string, ChatMessage[]> = {
  'session-finance': [
    {
      id: 'fin-msg-1',
      role: 'user',
      content: '根据知识库里的制度，帮我总结差旅报销里住宿和交通的核心要求。',
      createdAt: '2026-05-17 14:35',
      status: 'done'
    },
    {
      id: 'fin-msg-2',
      role: 'assistant',
      content:
        '住宿报销需要同时提交发票、入住清单和支付凭证。交通方面，高铁二等座、经济舱和市内交通可以按制度报销；超标准出行需要主管审批。若是打车或网约车，需要补充起终点和业务原因。',
      createdAt: '2026-05-17 14:36',
      status: 'done',
      citations: financeCitations,
      traceId: financeTraceSummary.id,
      model: 'doubao-seed-2-0-lite-260215',
      latencyMs: 2480,
      inputTokens: 1820,
      outputTokens: 436,
      toolCalls: [
        {
          id: 'tool-kb-1',
          name: 'knowledge_search',
          status: 'success',
          durationMs: 812,
          inputPreview: 'query=差旅报销 住宿 交通',
          outputPreview: '命中 2 份制度文档，返回 5 个高相关 chunk',
          summary: '从财务制度知识库中检索相关报销条款',
          steps: ['改写用户问题', '召回报销制度文档', '重排高相关片段'],
          model: 'embedding-large',
          tokens: 328
        }
      ]
    }
  ],
  'session-weather': [
    {
      id: 'weather-msg-1',
      role: 'user',
      content: '帮我查一下上海明天下午的天气，如果下雨提醒我改成线上会议。',
      createdAt: '2026-05-17 13:10',
      status: 'done'
    },
    {
      id: 'weather-msg-2',
      role: 'assistant',
      content:
        '明天下午上海以小雨转阴为主，14:00 至 17:00 的降水概率在 60% 左右。建议会前保留线上会议链接，并提前在会议通知中说明遇雨转线上的备用方案。',
      createdAt: '2026-05-17 13:11',
      status: 'done',
      traceId: weatherTraceSummary.id,
      model: 'doubao-seed-2-0-lite-260215',
      latencyMs: 1820,
      inputTokens: 620,
      outputTokens: 212,
      toolCalls: [
        {
          id: 'tool-time-1',
          name: 'time_lookup',
          status: 'success',
          durationMs: 95,
          inputPreview: 'utc_offset=+08:00',
          outputPreview: '当前时区已切换为 Asia/Shanghai',
          summary: '确认用户当前时区与目标日期',
          steps: ['解析相对时间', '校准目标日期'],
          tokens: 36
        },
        {
          id: 'tool-weather-1',
          name: 'weather_lookup',
          status: 'success',
          durationMs: 542,
          inputPreview: 'location=Shanghai,start=2026-05-18,duration=1',
          outputPreview: '多云转小雨，下午降水概率 60%',
          summary: '查询上海未来 24 小时天气',
          steps: ['查询小时级天气', '抽取下午时段', '评估降雨风险'],
          tokens: 88
        }
      ]
    }
  ],
  'session-support': [
    {
      id: 'support-msg-1',
      role: 'user',
      content: '帮我总结一下本周客服最常见的四类问题，并给出处理建议。',
      createdAt: '2026-05-16 17:55',
      status: 'done'
    },
    {
      id: 'support-msg-2',
      role: 'assistant',
      content:
        '本周问题主要集中在账号邀请、文档索引延迟、工作流权限配置和链路追踪筛选条件四类。建议分别补充邀请邮件模板、文档处理 SLA 提示、权限矩阵说明和 trace 检索示例。',
      createdAt: '2026-05-16 17:56',
      status: 'done',
      model: 'doubao-seed-2-0-lite-260215',
      latencyMs: 1280,
      inputTokens: 510,
      outputTokens: 166
    }
  ],
  'session-empty': []
}

export const traceDetails: Record<string, TraceDetail> = {
  [financeTraceSummary.id]: {
    summary: financeTraceSummary,
    nodes: [
      {
        nodeId: 'router-node-1',
        nodeName: 'RouteDecision',
        methodName: 'RouteDecision',
        nodeType: 'router',
        status: 'success',
        depth: 0,
        startTime: '2026-05-17 14:35:12',
        endTime: '2026-05-17 14:35:12',
        durationMs: 86
      },
      {
        nodeId: 'retrieval-node-1',
        nodeName: 'KnowledgeRetrieval',
        methodName: 'KnowledgeRetrieval',
        nodeType: 'retrieval',
        status: 'success',
        depth: 1,
        startTime: '2026-05-17 14:35:12',
        endTime: '2026-05-17 14:35:13',
        durationMs: 812
      },
      {
        nodeId: 'rerank-node-1',
        nodeName: 'ChunkRerank',
        methodName: 'ChunkRerank',
        nodeType: 'rerank',
        status: 'success',
        depth: 2,
        startTime: '2026-05-17 14:35:13',
        endTime: '2026-05-17 14:35:13',
        durationMs: 214
      },
      {
        nodeId: 'llm-node-1',
        nodeName: 'AnswerGeneration',
        methodName: 'AnswerGeneration',
        nodeType: 'llm',
        status: 'success',
        depth: 1,
        startTime: '2026-05-17 14:35:13',
        endTime: '2026-05-17 14:35:15',
        durationMs: 1582
      }
    ],
    routeReason: '用户问题明确指向公司制度，优先走知识库检索与引用回答链路。',
    retrievalQuery: '差旅报销 住宿 发票 交通 标准 审批',
    hitChunks: 5,
    citations: financeCitations,
    toolExecutions: [
      {
        id: 'tool-kb-1',
        name: 'knowledge_search',
        status: 'success',
        durationMs: 812,
        inputPreview: 'query=差旅报销 住宿 交通',
        outputPreview: '命中 2 份制度文档，返回 5 个高相关 chunk',
        summary: '从财务制度知识库中检索相关报销条款',
        steps: ['改写用户问题', '召回报销制度文档', '重排高相关片段'],
        model: 'embedding-large',
        tokens: 328,
        startedAt: '2026-05-17 14:35:12',
        endedAt: '2026-05-17 14:35:13'
      }
    ],
    steps: [
      {
        id: 'fin-step-1',
        title: '路由判定',
        kind: 'router',
        status: 'success',
        startAt: '14:35:12',
        endAt: '14:35:12',
        durationMs: 86,
        detail: '识别为知识库问答'
      },
      {
        id: 'fin-step-2',
        title: '知识检索',
        kind: 'retrieval',
        status: 'success',
        startAt: '14:35:12',
        endAt: '14:35:13',
        durationMs: 812,
        detail: '召回 5 个高相关 chunk'
      },
      {
        id: 'fin-step-3',
        title: '答案生成',
        kind: 'response',
        status: 'success',
        startAt: '14:35:13',
        endAt: '14:35:15',
        durationMs: 1582,
        detail: '带引用生成最终答复'
      }
    ],
    finalAnswer:
      '住宿报销需同时提交发票、入住清单和支付凭证。交通方面，高铁二等座、经济舱和市内交通可以按制度报销；超标准出行需要主管审批。若是打车或网约车，需要补充起终点和业务原因。',
    rawMeta: {
      traceId: financeTraceSummary.id,
      sessionId: 'session-finance',
      rerankScore: 0.92,
      citationCount: 2,
      route: 'knowledge-base-rag'
    }
  },
  [weatherTraceSummary.id]: {
    summary: weatherTraceSummary,
    nodes: [
      {
        nodeId: 'time-node-1',
        nodeName: 'TimeResolver',
        methodName: 'TimeResolver',
        nodeType: 'tool',
        status: 'success',
        depth: 0,
        startTime: '2026-05-17 13:10:10',
        endTime: '2026-05-17 13:10:10',
        durationMs: 95
      },
      {
        nodeId: 'weather-node-1',
        nodeName: 'WeatherLookup',
        methodName: 'WeatherLookup',
        nodeType: 'tool',
        status: 'success',
        depth: 0,
        startTime: '2026-05-17 13:10:11',
        endTime: '2026-05-17 13:10:11',
        durationMs: 542
      },
      {
        nodeId: 'weather-llm-node-1',
        nodeName: 'AnswerGeneration',
        methodName: 'AnswerGeneration',
        nodeType: 'llm',
        status: 'success',
        depth: 0,
        startTime: '2026-05-17 13:10:11',
        endTime: '2026-05-17 13:10:12',
        durationMs: 1183
      }
    ],
    routeReason: '问题包含实时外部信息，优先走工具调用链路。',
    retrievalQuery: '天气查询无需知识库检索',
    hitChunks: 0,
    citations: [],
    toolExecutions: [
      {
        id: 'tool-time-1',
        name: 'time_lookup',
        status: 'success',
        durationMs: 95,
        inputPreview: 'utc_offset=+08:00',
        outputPreview: '当前时区已切换为 Asia/Shanghai',
        summary: '确认用户当前时区与目标日期',
        steps: ['解析相对时间', '校准目标日期'],
        tokens: 36,
        startedAt: '2026-05-17 13:10:10',
        endedAt: '2026-05-17 13:10:10'
      },
      {
        id: 'tool-weather-1',
        name: 'weather_lookup',
        status: 'success',
        durationMs: 542,
        inputPreview: 'location=Shanghai,start=2026-05-18,duration=1',
        outputPreview: '多云转小雨，下午降水概率 60%',
        summary: '查询上海未来 24 小时天气',
        steps: ['查询小时级天气', '抽取下午时段', '评估降雨风险'],
        tokens: 88,
        startedAt: '2026-05-17 13:10:11',
        endedAt: '2026-05-17 13:10:11'
      }
    ],
    steps: [
      {
        id: 'weather-step-1',
        title: '时间解析',
        kind: 'tool',
        status: 'success',
        startAt: '13:10:10',
        endAt: '13:10:10',
        durationMs: 95,
        detail: '解析“明天下午”为 2026-05-18 14:00-17:00'
      },
      {
        id: 'weather-step-2',
        title: '天气查询',
        kind: 'tool',
        status: 'success',
        startAt: '13:10:11',
        endAt: '13:10:11',
        durationMs: 542,
        detail: '获取上海小时天气数据'
      },
      {
        id: 'weather-step-3',
        title: '结论生成',
        kind: 'response',
        status: 'success',
        startAt: '13:10:11',
        endAt: '13:10:12',
        durationMs: 1183,
        detail: '输出会务调整建议'
      }
    ],
    finalAnswer:
      '明天下午上海以小雨转阴为主，14:00 至 17:00 的降水概率在 60% 左右。建议会前保留线上会议链接，并提前在会议通知中说明遇雨转线上的备用方案。',
    rawMeta: {
      traceId: weatherTraceSummary.id,
      sessionId: 'session-weather',
      route: 'tool-call',
      weatherProvider: 'mock-weather-v1'
    }
  }
}

export const traces: TraceSummary[] = [
  financeTraceSummary,
  weatherTraceSummary,
  {
    id: 'trace-support-003',
    traceId: 'trace-support-003',
    traceName: '客服问题周报总结',
    question: '总结本周客服最常见的四类问题',
    route: 'direct-answer',
    conversationId: 'session-support',
    taskId: 'summary-task-support-003',
    userId: 'user-002',
    userName: '刘静',
    username: '刘静',
    toolCount: 0,
    model: 'doubao-seed-2-0-lite-260215',
    inputTokens: 510,
    outputTokens: 166,
    latencyMs: 1280,
    durationMs: 1280,
    status: 'success',
    createdAt: '2026-05-16 17:56',
    startTime: '2026-05-16 17:56'
  },
  {
    id: 'trace-kb-004',
    traceId: 'trace-kb-004',
    traceName: '知识库索引延迟诊断',
    question: '知识库索引任务为什么延迟？',
    route: 'knowledge-base-rag',
    conversationId: 'session-support',
    taskId: 'kb-task-delay-004',
    userId: 'user-003',
    userName: '吴天',
    username: '吴天',
    toolCount: 1,
    model: 'doubao-seed-2-0-lite-260215',
    inputTokens: 820,
    outputTokens: 190,
    latencyMs: 2140,
    durationMs: 2140,
    status: 'running',
    createdAt: '2026-05-17 11:42',
    startTime: '2026-05-17 11:42'
  }
]

export const knowledgeBases: KnowledgeBase[] = [
  {
    id: 'kb-finance',
    name: '财务制度库',
    description: '涵盖报销制度、采购流程、预算审批与合同归档规则。',
    documentCount: 12,
    updatedAt: '2026-05-17 10:20',
    createTime: '2026-05-02 09:20',
    updateTime: '2026-05-17 10:20',
    status: 'active',
    owner: '财务共享中心',
    tags: ['报销', '预算', '采购'],
    embeddingModel: 'text-embedding-3-large',
    collectionName: 'finance_biz_kb',
    createdBy: '陈若衡'
  },
  {
    id: 'kb-hr',
    name: '人事政策库',
    description: '员工入转调离、考勤、假期、绩效与晋升相关政策。',
    documentCount: 18,
    updatedAt: '2026-05-16 16:00',
    createTime: '2026-04-28 14:10',
    updateTime: '2026-05-16 16:00',
    status: 'active',
    owner: 'HRBP',
    tags: ['考勤', '假期', '绩效'],
    embeddingModel: 'text-embedding-3-large',
    collectionName: 'hr_group_kb',
    createdBy: '刘静'
  },
  {
    id: 'kb-support',
    name: '客服知识库',
    description: '面向客户支持团队的标准话术、故障排查和升级流程。',
    documentCount: 26,
    updatedAt: '2026-05-15 18:40',
    createTime: '2026-04-20 11:40',
    updateTime: '2026-05-15 18:40',
    status: 'syncing',
    owner: '客户成功部',
    tags: ['客服', '升级流程', 'FAQ'],
    embeddingModel: 'text-embedding-3-small',
    collectionName: 'support_group_knowledge',
    createdBy: '刘静'
  },
  {
    id: 'kb-product',
    name: '产品 FAQ',
    description: '对外产品常见问题、发布说明与版本差异说明。',
    documentCount: 9,
    updatedAt: '2026-05-12 09:30',
    createTime: '2026-04-16 10:00',
    updateTime: '2026-05-12 09:30',
    status: 'draft',
    owner: '产品运营',
    tags: ['产品', 'FAQ'],
    embeddingModel: 'text-embedding-3-small',
    collectionName: 'product_faq_collection',
    createdBy: '吴天'
  }
]

export const knowledgeDocuments: Record<string, KnowledgeDocument[]> = {
  'kb-finance': [
    {
      id: 'doc-fin-1',
      name: '差旅报销制度（2026 版）',
      docName: '差旅报销制度（2026 版）',
      type: 'PDF',
      status: 'success',
      updatedAt: '2026-05-17 10:20',
      updateTime: '2026-05-17 10:20',
      size: '2.4 MB',
      fileSize: 2516582,
      chunks: 86,
      source: '企业制度中心',
      summary: '明确住宿、交通、餐补与审批要求。',
      sourceType: 'file',
      processMode: 'chunk',
      enabled: true,
      chunkStrategy: 'structure_aware',
      chunkConfig: JSON.stringify({
        targetChars: 1400,
        maxChars: 1800,
        minChars: 600,
        overlapChars: 0
      }),
      fileType: 'pdf',
      chunkCount: 86,
      contentPreview:
        '第一章 总则\n为规范差旅报销流程，员工在发生住宿、交通、餐补等费用时，应遵循公司统一制度并保留完整附件。'
    },
    {
      id: 'doc-fin-2',
      name: '发票与附件要求',
      docName: '发票与附件要求',
      type: 'DOCX',
      status: 'success',
      updatedAt: '2026-05-16 19:05',
      updateTime: '2026-05-16 19:05',
      size: '418 KB',
      fileSize: 428032,
      chunks: 18,
      source: '共享财务',
      summary: '列出每类报销单所需附件。',
      sourceType: 'file',
      processMode: 'chunk',
      enabled: true,
      chunkStrategy: 'fixed_size',
      chunkConfig: JSON.stringify({
        chunkSize: 512,
        overlapSize: 128
      }),
      fileType: 'docx',
      chunkCount: 18,
      contentPreview:
        '住宿报销需上传发票、入住清单和支付凭证。交通类报销需上传车票、行程单或电子发票，并说明业务原因。'
    },
    {
      id: 'doc-fin-3',
      name: '预算审批流程图',
      docName: '预算审批流程图',
      type: 'PPTX',
      status: 'running',
      updatedAt: '2026-05-17 09:55',
      updateTime: '2026-05-17 09:55',
      size: '1.1 MB',
      fileSize: 1153433,
      chunks: 0,
      source: '预算管理组',
      summary: '审批节点与负责人说明。',
      sourceType: 'file',
      processMode: 'pipeline',
      enabled: true,
      pipelineId: 'pipeline-1',
      pipelineName: '财务制度 nightly sync',
      fileType: 'pptx',
      chunkCount: 0,
      contentPreview:
        '当前文档正在通过数据通道进行清洗与解析，完成后会生成新的分块和向量索引。'
    }
  ],
  'kb-hr': [
    {
      id: 'doc-hr-1',
      name: '员工假期政策',
      docName: '员工假期政策',
      type: 'PDF',
      status: 'success',
      updatedAt: '2026-05-14 10:10',
      updateTime: '2026-05-14 10:10',
      size: '1.2 MB',
      fileSize: 1258291,
      chunks: 44,
      source: 'HRIS',
      summary: '年假、事假、病假与调休规则。',
      sourceType: 'url',
      sourceLocation: 'https://intra.demo.ai/hr/leave-policy',
      processMode: 'chunk',
      enabled: true,
      scheduleEnabled: true,
      scheduleCron: '0 0 2 * * ?',
      chunkStrategy: 'structure_aware',
      chunkConfig: JSON.stringify({
        targetChars: 1400,
        maxChars: 1800,
        minChars: 600,
        overlapChars: 0
      }),
      fileType: 'pdf',
      chunkCount: 44,
      contentPreview:
        '员工年假按司龄分档核算，病假与事假需按流程提交审批，调休应在考勤周期内完成登记。'
    }
  ],
  'kb-support': [
    {
      id: 'doc-sup-1',
      name: '客户升级处理手册',
      docName: '客户升级处理手册',
      type: 'DOCX',
      status: 'success',
      updatedAt: '2026-05-15 18:40',
      updateTime: '2026-05-15 18:40',
      size: '930 KB',
      fileSize: 952320,
      chunks: 52,
      source: '客服运营',
      summary: '升级路径、SLA 和责任人。',
      sourceType: 'file',
      processMode: 'chunk',
      enabled: false,
      chunkStrategy: 'structure_aware',
      chunkConfig: JSON.stringify({
        targetChars: 1400,
        maxChars: 1800,
        minChars: 600,
        overlapChars: 0
      }),
      fileType: 'docx',
      chunkCount: 52,
      contentPreview:
        '客户升级请求需在 15 分钟内完成受理，并按严重级别通知值班负责人和研发支持。'
    }
  ],
  'kb-product': [
    {
      id: 'doc-prod-1',
      name: '版本发布说明 Q2',
      docName: '版本发布说明 Q2',
      type: 'PDF',
      status: 'failed',
      updatedAt: '2026-05-11 12:10',
      updateTime: '2026-05-11 12:10',
      size: '760 KB',
      fileSize: 778240,
      chunks: 0,
      source: '产品运营',
      summary: '导入失败，待重试。',
      sourceType: 'file',
      processMode: 'pipeline',
      enabled: false,
      pipelineId: 'pipeline-2',
      pipelineName: '客服 FAQ 每日抽取',
      fileType: 'pdf',
      chunkCount: 0,
      contentPreview:
        '当前导入失败，待修复原始文件质量或重新上传后再执行 OCR 与索引。'
    }
  ]
}

export const documentChunkLogs: Record<string, KnowledgeDocumentChunkLog[]> = {
  'doc-fin-1': [
    {
      id: 'chunk-log-fin-1',
      documentId: 'doc-fin-1',
      status: 'success',
      sourceType: 'file',
      processMode: 'chunk',
      chunkStrategy: 'structure_aware',
      chunkCount: 86,
      extractDuration: 640,
      chunkDuration: 1180,
      embedDuration: 1680,
      persistDuration: 420,
      otherDuration: 110,
      totalDuration: 4030,
      updateTime: '2026-05-17 10:20',
      updatedAt: '2026-05-17 10:20'
    }
  ],
  'doc-fin-2': [
    {
      id: 'chunk-log-fin-2',
      documentId: 'doc-fin-2',
      status: 'success',
      sourceType: 'file',
      processMode: 'chunk',
      chunkStrategy: 'fixed_size',
      chunkCount: 18,
      extractDuration: 210,
      chunkDuration: 360,
      embedDuration: 520,
      persistDuration: 160,
      otherDuration: 40,
      totalDuration: 1290,
      updateTime: '2026-05-16 19:05',
      updatedAt: '2026-05-16 19:05'
    }
  ],
  'doc-fin-3': [
    {
      id: 'chunk-log-fin-3',
      documentId: 'doc-fin-3',
      status: 'running',
      sourceType: 'file',
      processMode: 'pipeline',
      pipelineId: 'pipeline-1',
      pipelineName: '财务制度 nightly sync',
      chunkCount: 0,
      chunkDuration: 860,
      persistDuration: 0,
      otherDuration: 95,
      totalDuration: 955,
      updateTime: '2026-05-17 09:55',
      updatedAt: '2026-05-17 09:55'
    }
  ],
  'doc-hr-1': [
    {
      id: 'chunk-log-hr-1',
      documentId: 'doc-hr-1',
      status: 'success',
      sourceType: 'url',
      processMode: 'chunk',
      chunkStrategy: 'structure_aware',
      chunkCount: 44,
      extractDuration: 330,
      chunkDuration: 670,
      embedDuration: 1040,
      persistDuration: 280,
      otherDuration: 72,
      totalDuration: 2392,
      updateTime: '2026-05-14 10:10',
      updatedAt: '2026-05-14 10:10'
    }
  ],
  'doc-sup-1': [
    {
      id: 'chunk-log-sup-1',
      documentId: 'doc-sup-1',
      status: 'success',
      sourceType: 'file',
      processMode: 'chunk',
      chunkStrategy: 'structure_aware',
      chunkCount: 52,
      extractDuration: 410,
      chunkDuration: 890,
      embedDuration: 1210,
      persistDuration: 310,
      otherDuration: 66,
      totalDuration: 2886,
      updateTime: '2026-05-15 18:40',
      updatedAt: '2026-05-15 18:40'
    }
  ],
  'doc-prod-1': [
    {
      id: 'chunk-log-prod-1',
      documentId: 'doc-prod-1',
      status: 'failed',
      sourceType: 'file',
      processMode: 'pipeline',
      pipelineId: 'pipeline-2',
      pipelineName: '客服 FAQ 每日抽取',
      chunkCount: 0,
      chunkDuration: 420,
      persistDuration: 0,
      otherDuration: 38,
      totalDuration: 458,
      updateTime: '2026-05-11 12:10',
      updatedAt: '2026-05-11 12:10'
    }
  ]
}

export function updateKnowledgeDocument(
  kbId: string,
  docId: string,
  payload: KnowledgeDocumentUpdatePayload
) {
  const documents = knowledgeDocuments[kbId] ?? []
  const target = documents.find((item) => item.id === docId)
  if (!target) return null

  target.docName = payload.docName.trim()
  target.name = payload.docName.trim()
  target.processMode = payload.processMode
  target.chunkStrategy = payload.processMode === 'chunk' ? payload.chunkStrategy : undefined
  target.chunkConfig = buildChunkConfig(payload.processMode, payload.chunkStrategy, payload.chunkConfig)
  target.pipelineId = payload.processMode === 'pipeline' ? payload.pipelineId : undefined
  target.pipelineName =
    payload.processMode === 'pipeline'
      ? pipelineItems.find((item) => item.id === payload.pipelineId)?.name || payload.pipelineId
      : undefined
  target.sourceLocation = payload.sourceLocation?.trim() || target.sourceLocation
  target.scheduleEnabled = Boolean(payload.scheduleEnabled)
  target.scheduleCron = payload.scheduleEnabled ? payload.scheduleCron?.trim() || '' : ''
  target.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
  target.updateTime = target.updatedAt

  return cloneMock(target)
}

export function deleteKnowledgeDocument(kbId: string, docId: string) {
  const documents = knowledgeDocuments[kbId] ?? []
  const index = documents.findIndex((item) => item.id === docId)
  if (index === -1) return false
  documents.splice(index, 1)
  delete documentChunkLogs[docId]

  const kb = knowledgeBases.find((item) => item.id === kbId)
  if (kb) {
    kb.documentCount = Math.max(0, kb.documentCount - 1)
    kb.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
    kb.updateTime = kb.updatedAt
  }
  return true
}

export function toggleKnowledgeDocumentEnabled(kbId: string, docId: string, enabled: boolean) {
  const target = (knowledgeDocuments[kbId] ?? []).find((item) => item.id === docId)
  if (!target) return null
  target.enabled = enabled
  target.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
  target.updateTime = target.updatedAt
  return cloneMock(target)
}

export function startKnowledgeDocumentChunk(kbId: string, docId: string) {
  const target = (knowledgeDocuments[kbId] ?? []).find((item) => item.id === docId)
  if (!target) return null
  target.status = 'running'
  target.chunks = 0
  target.chunkCount = 0
  target.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
  target.updateTime = target.updatedAt

  documentChunkLogs[docId] = [
    {
      id: `chunk-log-${docId}-${Date.now()}`,
      documentId: docId,
      status: 'running',
      sourceType: target.sourceType,
      processMode: target.processMode,
      chunkStrategy: target.chunkStrategy,
      pipelineId: target.pipelineId,
      pipelineName: target.pipelineName,
      chunkCount: 0,
      chunkDuration: 0,
      persistDuration: 0,
      otherDuration: 0,
      totalDuration: 0,
      updateTime: target.updateTime,
      updatedAt: target.updatedAt
    }
  ]

  return cloneMock(target)
}

export function uploadKnowledgeDocument(kbId: string, payload: KnowledgeDocumentUploadPayload) {
  const documents = knowledgeDocuments[kbId] ?? (knowledgeDocuments[kbId] = [])
  const docName =
    payload.docName?.trim() ||
    payload.file?.name ||
    payload.sourceLocation?.split('/').filter(Boolean).pop() ||
    '新文档'
  const fileType = payload.file ? inferFileTypeFromName(payload.file.name) : 'url'
  const size = payload.file?.size ?? 0
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const nextDoc: KnowledgeDocument = {
    id: createDocumentId(),
    name: docName,
    docName,
    type: payload.sourceType === 'file' ? inferDisplayType(fileType) : 'URL',
    status: 'pending',
    updatedAt: now,
    updateTime: now,
    size:
      size < 1024
        ? `${size} B`
        : size < 1024 * 1024
          ? `${(size / 1024).toFixed(1)} KB`
          : `${(size / 1024 / 1024).toFixed(1)} MB`,
    fileSize: size,
    chunks: 0,
    chunkCount: 0,
    source: payload.sourceType === 'file' ? '本地上传' : '远程 URL',
    summary: payload.sourceType === 'file' ? '新上传文档，等待处理。' : '远程文档已接入，等待拉取处理。',
    sourceType: payload.sourceType,
    sourceLocation: payload.sourceLocation?.trim() || '',
    processMode: payload.processMode,
    enabled: true,
    chunkStrategy: payload.processMode === 'chunk' ? payload.chunkStrategy : undefined,
    chunkConfig: buildChunkConfig(payload.processMode, payload.chunkStrategy, payload.chunkConfig),
    pipelineId: payload.processMode === 'pipeline' ? payload.pipelineId : undefined,
    pipelineName:
      payload.processMode === 'pipeline'
        ? pipelineItems.find((item) => item.id === payload.pipelineId)?.name || payload.pipelineId
        : undefined,
    scheduleEnabled: Boolean(payload.scheduleEnabled),
    scheduleCron: payload.scheduleEnabled ? payload.scheduleCron?.trim() || '' : '',
    fileType,
    contentPreview:
      payload.sourceType === 'file'
        ? '该文档已上传，待进入解析与索引流程。'
        : `已登记远程来源：${payload.sourceLocation?.trim() || '-'}`
  }

  documents.unshift(nextDoc)
  documentChunkLogs[nextDoc.id] = [
    {
      id: `chunk-log-${nextDoc.id}`,
      documentId: nextDoc.id,
      status: 'pending',
      sourceType: nextDoc.sourceType,
      processMode: nextDoc.processMode,
      chunkStrategy: nextDoc.chunkStrategy,
      pipelineId: nextDoc.pipelineId,
      pipelineName: nextDoc.pipelineName,
      chunkCount: 0,
      chunkDuration: 0,
      persistDuration: 0,
      otherDuration: 0,
      totalDuration: 0,
      updateTime: now,
      updatedAt: now
    }
  ]

  const kb = knowledgeBases.find((item) => item.id === kbId)
  if (kb) {
    kb.documentCount += 1
    kb.updatedAt = now
    kb.updateTime = now
  }

  return cloneMock(nextDoc)
}

export const pipelineItems: PipelineTask[] = [
  {
    id: 'pipeline-1',
    name: '财务制度 nightly sync',
    type: 'pipeline',
    status: 'running',
    progress: 72,
    updatedAt: '2026-05-17 15:05',
    owner: '数据平台',
    detail: '同步财务制度站点并更新向量索引'
  },
  {
    id: 'pipeline-2',
    name: '客服 FAQ 每日抽取',
    type: 'pipeline',
    status: 'success',
    progress: 100,
    updatedAt: '2026-05-17 09:00',
    owner: '客户成功部',
    detail: '从工单系统抽取 FAQ 并写入知识库'
  }
]

export const pipelineTasks: PipelineTask[] = [
  {
    id: 'task-1',
    name: 'doc-fin-3 分块任务',
    type: 'task',
    status: 'running',
    progress: 56,
    updatedAt: '2026-05-17 10:02',
    owner: '索引服务',
    detail: 'PPT 内容解析中'
  },
  {
    id: 'task-2',
    name: 'doc-prod-1 OCR 重试',
    type: 'task',
    status: 'error',
    progress: 100,
    updatedAt: '2026-05-11 12:15',
    owner: 'OCR Worker',
    detail: '扫描页质量不足，需重新上传'
  }
]

export const intentTree: IntentNode[] = [
  {
    id: 'intent-1',
    name: '制度问答',
    description: '围绕人事、财务和行政制度的知识库问答',
    sampleCount: 42,
    children: [
      {
        id: 'intent-1-1',
        name: '报销规则',
        description: '差旅、采购、发票和补贴问题',
        sampleCount: 18
      },
      {
        id: 'intent-1-2',
        name: '假期政策',
        description: '请假、调休、加班与补卡',
        sampleCount: 11
      }
    ]
  },
  {
    id: 'intent-2',
    name: '实时查询',
    description: '时间、天气和状态类工具调用',
    sampleCount: 12
  }
]

export const mappings: QueryMapping[] = [
  {
    id: 'map-1',
    keyword: '差旅报销',
    intent: '报销规则',
    target: 'kb-finance',
    updatedAt: '2026-05-17 09:30',
    status: 'active'
  },
  {
    id: 'map-2',
    keyword: '天气提醒',
    intent: '实时查询',
    target: 'weather_tool',
    updatedAt: '2026-05-16 16:30',
    status: 'active'
  },
  {
    id: 'map-3',
    keyword: '请假政策',
    intent: '假期政策',
    target: 'kb-hr',
    updatedAt: '2026-05-15 15:10',
    status: 'draft'
  }
]

export const sampleQuestions: SampleQuestion[] = [
  {
    id: 'sample-1',
    question: '根据财务制度说明住宿和交通报销需要哪些附件',
    category: '制度问答',
    updatedAt: '2026-05-17 10:00'
  },
  {
    id: 'sample-2',
    question: '上海明天下午会下雨吗，需要改线上会议吗',
    category: '实时查询',
    updatedAt: '2026-05-16 17:20'
  },
  {
    id: 'sample-3',
    question: '总结本周用户最常见的四类问题',
    category: '运营分析',
    updatedAt: '2026-05-15 11:05'
  }
]

export const users: User[] = [
  currentUser,
  {
    id: 'user-002',
    name: '刘静',
    email: 'support.owner@demo.ai',
    role: '客服负责人',
    status: 'active',
    lastActive: '2026-05-17 14:58'
  },
  {
    id: 'user-003',
    name: '吴天',
    email: 'product.ops@demo.ai',
    role: '产品运营',
    status: 'invited',
    lastActive: '2026-05-15 09:20'
  }
]

export const providerConfigs: ProviderConfig[] = [
  {
    id: 'provider-1',
    name: 'OpenAI 主模型',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-5.4',
    enabled: true
  },
  {
    id: 'provider-2',
    name: '轻量路由模型',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-5.4-mini',
    enabled: true
  }
]

export const promptStrategies: PromptStrategy[] = [
  {
    id: 'prompt-1',
    name: '制度问答策略',
    description: '优先引用知识库，并输出明确出处。',
    temperature: 0.2,
    maxTokens: 1200,
    isDefault: true
  },
  {
    id: 'prompt-2',
    name: '工具调用策略',
    description: '先判断是否需要天气、时间等外部工具。',
    temperature: 0.1,
    maxTokens: 900,
    isDefault: false
  }
]

export const mcpServers: McpServer[] = [
  {
    id: 'mcp-1',
    name: 'Weather Tools',
    url: 'http://localhost:9091',
    status: 'online',
    toolCount: 3,
    lastCheckedAt: '2026-05-17 15:08',
    tools: ['weather_lookup', 'air_quality', 'sunrise_sunset']
  },
  {
    id: 'mcp-2',
    name: 'Knowledge Ops',
    url: 'http://localhost:9092',
    status: 'checking',
    toolCount: 5,
    lastCheckedAt: '2026-05-17 14:58',
    tools: ['index_document', 'retry_task', 'search_chunks', 'get_trace', 'list_failures']
  }
]

export const systemSettings: SystemSettings = {
  providers: providerConfigs,
  promptStrategies,
  mcpServers
}

export const dashboardData: DashboardData = {
  metrics: [
    {
      label: '本日会话',
      value: '1,284',
      delta: '+12.4%',
      trend: 'up'
    },
    {
      label: '知识命中率',
      value: '87.2%',
      delta: '+3.1%',
      trend: 'up'
    },
    {
      label: '平均响应时延',
      value: '2.1s',
      delta: '-0.4s',
      trend: 'up'
    },
    {
      label: '失败任务',
      value: '3',
      delta: '+1',
      trend: 'down'
    }
  ],
  trend: [
    { label: '周一', value: 46 },
    { label: '周二', value: 62 },
    { label: '周三', value: 58 },
    { label: '周四', value: 76 },
    { label: '周五', value: 82 },
    { label: '周六', value: 49 },
    { label: '周日', value: 64 }
  ],
  recentTasks: pipelineTasks,
  recentTraces: traces.slice(0, 3)
}

export const searchSuggestionGroups: SearchSuggestionGroup[] = [
  {
    label: '知识库',
    items: knowledgeBases.map((item) => ({
      id: item.id,
      title: item.name,
      description: item.description,
      href: `/admin/knowledge/${item.id}`
    }))
  },
  {
    label: '文档',
    items: Object.entries(knowledgeDocuments)
      .flatMap(([kbId, documents]) =>
        documents.map((document) => ({
          id: document.id,
          title: document.name,
          description: `${document.type} · ${document.status}`,
          href: `/admin/knowledge/${kbId}/docs/${document.id}`
        }))
      )
      .slice(0, 6)
  }
]
