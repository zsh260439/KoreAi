export type CodeMapArea = 'workspace-chat' | 'streaming-thinking' | 'knowledge-admin'

export type CodeMapLayer =
  | 'view'
  | 'component'
  | 'composable'
  | 'client-server'
  | 'controller'
  | 'service'
  | 'utility'
  | 'llm'
  | 'storage'
  | 'shared-type'

export type FunctionLink = {
  id: string
  label: string
}

export type FunctionComment = {
  title: string
  start: number
  end: number
  detail: string
}

export type FunctionDoc = {
  id: string
  title: string
  symbol: string
  owner: string
  file: string
  lookupHint: string
  area: CodeMapArea
  layer: CodeMapLayer
  summary: string
  code: string[]
  comments: FunctionComment[]
  callers: FunctionLink[]
  callees: FunctionLink[]
}

export type FlowScenario = {
  id: string
  title: string
  area: CodeMapArea
  summary: string
  functionIds: string[]
}

export const areaOptions: { value: CodeMapArea | 'all'; label: string }[] = [
  { value: 'all', label: '全部模块' },
  { value: 'workspace-chat', label: '工作台聊天主链路' },
  { value: 'streaming-thinking', label: '流式思考可视化' },
  { value: 'knowledge-admin', label: '知识库后台功能' }
]

export const layerOptions: { value: CodeMapLayer | 'all'; label: string }[] = [
  { value: 'all', label: '全部层级' },
  { value: 'view', label: 'View' },
  { value: 'component', label: 'Component' },
  { value: 'composable', label: 'Composable' },
  { value: 'client-server', label: 'Client Server' },
  { value: 'controller', label: 'Controller' },
  { value: 'service', label: 'Service' },
  { value: 'utility', label: 'Utility' },
  { value: 'llm', label: 'LLM / Parser' },
  { value: 'storage', label: 'Storage' },
  { value: 'shared-type', label: 'Shared Type' }
]

export const flowScenarios: FlowScenario[] = [
  {
    id: 'chat-main',
    title: '用户发送消息 -> AI 回复消息',
    area: 'workspace-chat',
    summary:
      '从输入框提交开始，穿过页面层、前端状态层、流式请求层、后端控制器、服务层和知识问答层，最后再回到消息气泡完成渲染。',
    functionIds: [
      'prompt-box-submit',
      'workspace-handle-composer-submit',
      'workspace-handle-send',
      'workspace-send-message',
      'workspace-stream-assistant-response',
      'workspace-request-stream-api',
      'workspace-controller-chat-stream',
      'workspace-service-prepare-context',
      'workspace-service-chat-stream',
      'knowledge-service-stream-ask',
      'knowledge-qa-stream-answer',
      'workspace-apply-stream-event'
    ]
  },
  {
    id: 'thinking-stream',
    title: 'KoreAI is thinking... 流式思考链路',
    area: 'streaming-thinking',
    summary:
      '这条链路只关注 think 模式下的行为，包括 placeholder 创建、服务端标签拆流、前端 responseFlow 拼装，以及最终 completed 收口。',
    functionIds: [
      'workspace-create-placeholder',
      'chat-flow-create-placeholder',
      'knowledge-qa-stream-answer',
      'workspace-apply-stream-event',
      'chat-flow-append-thinking',
      'workspace-service-chat-stream'
    ]
  },
  {
    id: 'knowledge-admin',
    title: '知识库后台功能链路',
    area: 'knowledge-admin',
    summary:
      '覆盖文档创建、storagePath 持久化、chunk 重建、embedding 生成、混合召回，以及命中预览跳转。',
    functionIds: [
      'documents-submit-upload',
      'knowledge-documents-create',
      'knowledge-service-create-document',
      'knowledge-service-rebuild-chunks',
      'knowledge-service-retrieve',
      'vector-store-similarity-search'
    ]
  }
]

export const functionDocs: FunctionDoc[] = [
  {
    id: 'prompt-box-submit',
    title: '输入框提交函数',
    symbol: 'submit',
    owner: 'WorkspacePromptBox.vue',
    file: 'apps/client/src/views/workspace/components/input/WorkspacePromptBox.vue',
    lookupHint: '搜索 `const submit = () => {`',
    area: 'workspace-chat',
    layer: 'component',
    summary:
      '这是用户点击发送按钮或按下 Enter 之后进入的第一个函数。它负责区分“停止生成”和“发起提交”两种行为，并把前端输入状态封装成统一 payload。',
    code: [
      'const submit = () => {',
      '  if (props.streaming) {',
      "    emit('stop')",
      '    return',
      '  }',
      '',
      '  if (props.disabled || !hasContent.value) {',
      '    return',
      '  }',
      '',
      "  emit('submit', {",
      '    message: props.modelValue.trim(),',
      '    capabilities: promptCapabilities.value,',
      '    knowledgeBaseId: props.selectedKnowledgeBaseId || undefined',
      '  })',
      '}'
    ],
    comments: [
      {
        title: '流式状态下改为 stop',
        start: 2,
        end: 4,
        detail:
          '当前正在 streaming 时，这个按钮不再代表“发送”，而是代表“停止生成”。这里直接发出 stop 事件，交给 useWorkspaceChat.stopStreaming。'
      },
      {
        title: '阻止无效提交',
        start: 7,
        end: 8,
        detail:
          'disabled 和空内容两种情况都会提前返回，保证真正进入聊天主链路的 payload 已经具备最基本的可发送条件。'
      },
      {
        title: '统一提交载荷',
        start: 11,
        end: 15,
        detail:
          '这里把 message、PromptCapabilities 和 knowledgeBaseId 封装在同一个 submit 事件里，页面层无需再去拼装输入框内部状态。'
      }
    ],
    callers: [],
    callees: [
      { id: 'workspace-handle-composer-submit', label: '把 payload 交给工作台页面' }
    ]
  },
  {
    id: 'workspace-handle-composer-submit',
    title: '页面层接管提交',
    symbol: 'handleComposerSubmit',
    owner: 'workspace/index.vue',
    file: 'apps/client/src/views/workspace/index.vue',
    lookupHint: '搜索 `const handleComposerSubmit = (payload:`',
    area: 'workspace-chat',
    layer: 'view',
    summary:
      '页面层在这里完成输入框与聊天状态机之间的衔接：清空输入框，并把 submit 事件交给 handleSend。',
    code: [
      'const handleComposerSubmit = (payload: {',
      '  message: string',
      '  capabilities: PromptCapabilities',
      '  knowledgeBaseId?: string',
      '}) => {',
      '  if (!payload.message.trim()) {',
      '    return',
      '  }',
      '',
      "  composerValue.value = ''",
      '  void handleSend(payload.message, payload.capabilities, payload.knowledgeBaseId)',
      '}'
    ],
    comments: [
      {
        title: '页面层只做最轻的入口控制',
        start: 6,
        end: 7,
        detail:
          '这里保留了一个最小入口校验，只阻止全空白消息进入后续流程。更完整的状态控制仍然由 useWorkspaceChat.sendMessage 负责。'
      },
      {
        title: '先清空输入框再异步发送',
        start: 10,
        end: 11,
        detail:
          '界面响应上，这里先把 composerValue 清空，让用户立即感知消息已经进入发送流程；真正的请求和占位消息创建发生在 handleSend 之后。'
      }
    ],
    callers: [{ id: 'prompt-box-submit', label: '来自输入框 submit 事件' }],
    callees: [{ id: 'workspace-handle-send', label: '转给 handleSend 处理' }]
  },
  {
    id: 'workspace-handle-send',
    title: '页面层发送桥接函数',
    symbol: 'handleSend',
    owner: 'workspace/index.vue',
    file: 'apps/client/src/views/workspace/index.vue',
    lookupHint: '搜索 `const handleSend = async (`',
    area: 'workspace-chat',
    layer: 'view',
    summary:
      'handleSend 是页面层和 useWorkspaceChat 之间的桥。它关心的不是聊天细节，而是“发送之后是否需要切换路由到新的 conversationId”。',
    code: [
      'const handleSend = async (',
      '  message: string,',
      '  capabilities: PromptCapabilities,',
      '  knowledgeBaseId?: string',
      ') => {',
      '  const conversationId = await workspaceChat.sendMessage(message, capabilities, knowledgeBaseId)',
      '',
      '  if (',
      '    conversationId &&',
      "    conversationId !== (typeof route.params.conversationId === 'string' ? route.params.conversationId : '')",
      '  ) {',
      '    await router.push(`/workspace/${conversationId}`)',
      '  }',
      '}'
    ],
    comments: [
      {
        title: '真正的聊天行为交给 composable',
        start: 6,
        end: 6,
        detail:
          '这里没有自己构造任何消息，也不消费流式事件。它只是把页面层参数交给 useWorkspaceChat.sendMessage。'
      },
      {
        title: '发送成功后处理路由',
        start: 8,
        end: 12,
        detail:
          '如果这次发送实际落到的是一个新的 conversationId，页面层需要把地址切换到新的会话 URL，保证刷新后还能直接定位到当前会话。'
      }
    ],
    callers: [{ id: 'workspace-handle-composer-submit', label: '来自 handleComposerSubmit' }],
    callees: [{ id: 'workspace-send-message', label: '调用聊天主状态机 sendMessage' }]
  },
  {
    id: 'workspace-send-message',
    title: '聊天主状态机入口',
    symbol: 'sendMessage',
    owner: 'useWorkspaceChat.ts',
    file: 'apps/client/src/composables/useWorkspaceChat.ts',
    lookupHint: '搜索 `const sendMessage = async (`',
    area: 'workspace-chat',
    layer: 'composable',
    summary:
      'sendMessage 是前端聊天流程的真正入口。它会创建 userMessage、assistant placeholder，并在本地先把两条消息写进 contentList，再进入流式请求。',
    code: [
      'const sendMessage = async (',
      '  content: string,',
      '  promptCapabilities?: PromptCapabilities,',
      '  knowledgeBaseId?: string',
      ') => {',
      '  const normalizedContent = content.trim()',
      '  if (!normalizedContent || activeRequest.value) {',
      "    return ''",
      '  }',
      '',
      '  const normalizedCapabilities = normalizePromptCapabilities(promptCapabilities)',
      '  const conversation =',
      '    conversationList.activeConversation.value ?? (await conversationList.createConversation())',
      '  const sessionContentList = [...(contentListBySession.value[conversation.id] ?? [])]',
      '  const userMessage = toUserChatMessage(conversation.id, normalizedContent, normalizedCapabilities)',
      '  const assistantMessage = toAssistantPlaceholderMessage(',
      '    conversation.id,',
      '    conversation.model,',
      '    normalizedCapabilities',
      '  )',
      '',
      '  sessionContentList.push(userMessage, assistantMessage)',
      '  setConversationMessages(conversation.id, sessionContentList)',
      '  error.value = null',
      '',
      '  return streamAssistantResponse({',
      '    conversationId: conversation.id,',
      '    query: normalizedContent,',
      '    promptCapabilities: normalizedCapabilities,',
      '    knowledgeBaseId,',
      '    sessionContentList',
      '  })',
      '}'
    ],
    comments: [
      {
        title: '入口态校验与并发保护',
        start: 6,
        end: 8,
        detail:
          '这里只做两件最关键的事情：消息必须非空，且当前不能已经存在 activeRequest。这样可以防止空消息和重复并发发送。'
      },
      {
        title: '先找会话，没有则创建',
        start: 11,
        end: 13,
        detail:
          '如果当前页面还没有 activeConversation，sendMessage 会先创建一个新的 conversation，再把消息写到这个新会话里。'
      },
      {
        title: '先写本地占位消息再发请求',
        start: 15,
        end: 23,
        detail:
          '这里的关键是“先渲染，再请求”。用户消息和 assistant placeholder 会立刻出现在界面上，前端不需要等后端响应后才显示消息框。'
      },
      {
        title: '真正进入流式阶段',
        start: 25,
        end: 31,
        detail:
          '所有本地状态准备好之后，才进入 streamAssistantResponse。后续的 NDJSON 消费、错误处理和 completed 回填都在那里完成。'
      }
    ],
    callers: [{ id: 'workspace-handle-send', label: '来自页面层 handleSend' }],
    callees: [
      { id: 'workspace-create-placeholder', label: '创建 assistant placeholder' },
      { id: 'workspace-stream-assistant-response', label: '进入流式请求阶段' }
    ]
  },
  {
    id: 'workspace-stream-assistant-response',
    title: '流式响应调度函数',
    symbol: 'streamAssistantResponse',
    owner: 'useWorkspaceChat.ts',
    file: 'apps/client/src/composables/useWorkspaceChat.ts',
    lookupHint: '搜索 `const streamAssistantResponse = async (`',
    area: 'workspace-chat',
    layer: 'composable',
    summary:
      'streamAssistantResponse 负责建立 AbortController，调用流式 API，并把每个事件持续映射回最后一条 assistant 消息。',
    code: [
      'const streamAssistantResponse = async (params: {',
      '  conversationId: string',
      '  query: string',
      '  promptCapabilities: PromptCapabilities',
      '  knowledgeBaseId?: string',
      '  regenerate?: boolean',
      '  sessionContentList: ChatMessage[]',
      '}) => {',
      '  const controller = new AbortController()',
      '  activeRequest.value = { conversationId: params.conversationId, controller }',
      '',
      '  let sessionContentList = params.sessionContentList',
      '',
      '  try {',
      '    const result = await requestWorkspaceChatStreamAPI(',
      '      {',
      '        conversationId: params.conversationId,',
      '        query: params.query,',
      '        knowledgeBaseId: params.knowledgeBaseId,',
      '        think: params.promptCapabilities.think,',
      '        regenerate: params.regenerate',
      '      },',
      '      {',
      '        signal: controller.signal,',
      '        onEvent: (event) => {',
      '          sessionContentList = updateAssistantMessage(',
      '            params.conversationId,',
      '            sessionContentList,',
      '            (assistantMessage) => applyStreamEventToAssistantMessage(assistantMessage, event)',
      '          )',
      '        }',
      '      }',
      '    )',
      '',
      '    sessionContentList = updateAssistantMessage(',
      '      params.conversationId,',
      '      sessionContentList,',
      '      (assistantMessage) => finalizeAssistantMessage(assistantMessage, result, params.promptCapabilities)',
      '    )',
      '',
      '    conversationList.upsertConversation(result.conversation)',
      '    conversationList.selectConversation(result.conversationId)',
      '    return result.conversationId',
      '  } finally {',
      '    activeRequest.value = null',
      '  }',
      '}'
    ],
    comments: [
      {
        title: '建立当前请求上下文',
        start: 9,
        end: 10,
        detail:
          'activeRequest 是整个工作台“是否正在生成”的唯一事实来源。stopStreaming 和按钮状态都是基于它来判断的。'
      },
      {
        title: '把每个流式事件都投递回最后一条 assistant 消息',
        start: 14,
        end: 31,
        detail:
          'onEvent 不直接操作 DOM，而是持续调用 updateAssistantMessage，把最后一条 assistant 消息交给 applyStreamEventToAssistantMessage 做状态转换。'
      },
      {
        title: 'completed 后用最终结果收口',
        start: 33,
        end: 40,
        detail:
          '流式事件只负责逐步增量更新；当 requestWorkspaceChatStreamAPI 返回最终 WorkspaceChatResult 时，前端还要再执行一次 finalizeAssistantMessage，确保 answer、sources、reasoningSteps 都与最终落库结果完全一致。'
      },
      {
        title: '请求结束后释放 activeRequest',
        start: 43,
        end: 44,
        detail:
          '只要 finally 执行，页面层就会认为本次 streaming 已经结束，因此停止按钮、输入禁用态和 regenerate 状态都会随之复位。'
      }
    ],
    callers: [{ id: 'workspace-send-message', label: '来自 sendMessage' }],
    callees: [
      { id: 'workspace-request-stream-api', label: '调用前端流式请求层' },
      { id: 'workspace-apply-stream-event', label: '消费每个流式事件' }
    ]
  },
  {
    id: 'workspace-apply-stream-event',
    title: '把流式事件映射到消息 UI',
    symbol: 'applyStreamEventToAssistantMessage',
    owner: 'useWorkspaceChat.ts',
    file: 'apps/client/src/composables/useWorkspaceChat.ts',
    lookupHint: '搜索 `function applyStreamEventToAssistantMessage(`',
    area: 'streaming-thinking',
    layer: 'composable',
    summary:
      '这个函数是前端思考可视化的核心枢纽。所有 WorkspaceChatStreamEvent 最后都会在这里被翻译成 responseFlow 的变化。',
    code: [
      'function applyStreamEventToAssistantMessage(',
      '  assistantMessage: ChatMessage,',
      '  event: WorkspaceChatStreamEvent',
      '): ChatMessage {',
      "  if (event.type === 'completed' || event.type === 'error') {",
      '    return assistantMessage',
      '  }',
      '',
      "  if (event.type === 'answer_delta') {",
      '    if (!assistantMessage.responseFlow) {',
      '      return { ...assistantMessage, content: assistantMessage.content + event.delta }',
      '    }',
      '',
      '    const responseFlow = appendStreamingAnswerDelta(assistantMessage.responseFlow, event.delta)',
      '    return { ...assistantMessage, content: responseFlow.answer.content, responseFlow }',
      '  }',
      '',
      '  const responseFlow = assistantMessage.responseFlow ?? createThinkingPlaceholderFlow()',
      '',
      '  return {',
      '    ...assistantMessage,',
      '    responseFlow: appendStreamingThinkingStageDelta(responseFlow, event.delta)',
      '  }',
      '}'
    ],
    comments: [
      {
        title: 'completed / error 不在这里直接改内容',
        start: 5,
        end: 6,
        detail:
          'completed 与 error 只是控制流信号，不是增量文本信号。真正的最终内容回填在 finalizeAssistantMessage，错误文案回填在 createStreamingErrorMessage。'
      },
      {
        title: 'answer_delta 有两条路径',
        start: 9,
        end: 15,
        detail:
          '如果当前 assistantMessage 还没有 responseFlow，就走普通 content 追加；如果已有 responseFlow，就把增量写进 responseFlow.answer，同时同步 message.content。'
      },
      {
        title: '思考阶段统一走 responseFlow',
        start: 18,
        end: 22,
        detail:
          '当前实现已经不再区分多个 reasoning_step 事件，而是把所有 thinking_delta 直接追加到单块 thinking 文本中。这样 ChatMessageBubble 只需要读取一个思考区。'
      }
    ],
    callers: [
      { id: 'workspace-stream-assistant-response', label: '在 onEvent 中持续调用' }
    ],
    callees: [
      { id: 'chat-flow-create-placeholder', label: '无 responseFlow 时创建 placeholder' },
      { id: 'chat-flow-append-thinking', label: '更新 thinking / answer 阶段数据' }
    ]
  },
  {
    id: 'workspace-create-placeholder',
    title: '创建 assistant placeholder 消息',
    symbol: 'toAssistantPlaceholderMessage',
    owner: 'useWorkspaceChat.ts',
    file: 'apps/client/src/composables/useWorkspaceChat.ts',
    lookupHint: '搜索 `const toAssistantPlaceholderMessage = (`',
    area: 'streaming-thinking',
    layer: 'composable',
    summary:
      'assistant placeholder 是思考可视化得以提前出现的关键。只要 think 打开，它在还没收到任何流式事件前就已经带着 responseFlow 初始结构。',
    code: [
      'const toAssistantPlaceholderMessage = (',
      '  conversationId: string,',
      '  model: string | null,',
      '  promptCapabilities: PromptCapabilities',
      '): ChatMessage => ({',
      '  id: `assistant-${Date.now() + 1}`,',
      '  conversationId,',
      "  role: 'assistant',",
      "  content: '',",
      '  createdAt: new Date().toISOString(),',
      '  citations: null,',
      '  model,',
      '  latencyMs: null,',
      '  reasoningSteps: null,',
      '  promptCapabilities,',
      "  status: 'streaming',",
      '  responseFlow: promptCapabilities.think ? createThinkingPlaceholderFlow() : undefined',
      '})'
    ],
    comments: [
      {
        title: 'placeholder 在真正响应前就进入 streaming',
        start: 16,
        end: 16,
        detail:
          '这条消息创建时 status 就是 streaming，所以页面会立即进入“AI 正在工作”的状态。'
      },
      {
        title: 'think 打开时立即挂上 responseFlow',
        start: 17,
        end: 17,
        detail:
          '只要 think 为 true，这条 placeholder 就会预装 createThinkingPlaceholderFlow。这样 ChatMessageBubble 无需等待第一条 thinking_delta 才开始渲染思考区。'
      }
    ],
    callers: [{ id: 'workspace-send-message', label: 'sendMessage 创建占位消息时调用' }],
    callees: [{ id: 'chat-flow-create-placeholder', label: '创建 thinking 初始结构' }]
  },
  {
    id: 'chat-flow-create-placeholder',
    title: '创建 responseFlow 初始结构',
    symbol: 'createThinkingPlaceholderFlow',
    owner: 'chat-flow.ts',
    file: 'apps/client/src/utils/chat-flow.ts',
    lookupHint: '搜索 `export const createThinkingPlaceholderFlow`',
    area: 'streaming-thinking',
    layer: 'utility',
    summary:
      '这个函数定义了前端思考可视化最初的骨架：thinking 数组为空，answer 处于 pending 状态，showActions 为 false。',
    code: [
      'export const createThinkingPlaceholderFlow = (): AssistantResponseFlow => ({',
      '  thinking: [],',
      '  answer: {',
      "    kind: 'answer',",
      '    title: FINAL_ANSWER_TITLE,',
      "    status: 'pending',",
      "    content: '',",
      "    visibleContent: ''",
      '  },',
      '  showActions: false',
      '})'
    ],
    comments: [
      {
        title: 'thinking 先空出来',
        start: 2,
        end: 2,
        detail:
          'thinking 数组一开始为空，后续第一次收到 thinking_delta 时才会插入唯一的一块思考文本。'
      },
      {
        title: 'answer 初始状态是 pending',
        start: 3,
        end: 9,
        detail:
          '这表示“最终回答区已经准备好了容器，但内容还未开始生成”。ChatMessageBubble 会根据这个状态决定是否展示占位文案。'
      },
      {
        title: '操作按钮必须等最终完成才展示',
        start: 10,
        end: 10,
        detail:
          'showActions 为 false 时，regenerate 等操作不会显示；它只会在 finalizeStreamingResponseFlow 或 buildCompletedResponseFlow 后变成 true。'
      }
    ],
    callers: [
      { id: 'workspace-create-placeholder', label: '创建 assistant placeholder 时调用' },
      { id: 'workspace-apply-stream-event', label: '思考事件到来但尚无 responseFlow 时兜底创建' }
    ],
    callees: [{ id: 'chat-flow-append-thinking', label: '后续会继续追加 thinking / answer 内容' }]
  },
  {
    id: 'chat-flow-append-thinking',
    title: '追加 thinking 与 answer 增量',
    symbol: 'appendStreamingThinkingStageDelta / appendStreamingAnswerDelta',
    owner: 'chat-flow.ts',
    file: 'apps/client/src/utils/chat-flow.ts',
    lookupHint: '搜索 `appendStreamingThinkingStageDelta` 与 `appendStreamingAnswerDelta`',
    area: 'streaming-thinking',
    layer: 'utility',
    summary:
      '这组函数真正把每个流式增量写进 responseFlow，前端看到的“边生成边展开流程”就是由它们驱动出来的。',
    code: [
      'export const appendStreamingThinkingStageDelta = (',
      '  flow: AssistantResponseFlow,',
      '  delta: string',
      '): AssistantResponseFlow => {',
      '  const stage = flow.thinking[0]',
      '  if (!delta) {',
      '    return flow',
      '  }',
      '',
      '  if (!stage) {',
      '    return {',
      '      ...flow,',
      '      thinking: [{',
      "        kind: 'thinking',",
      "        id: 'streaming-thinking',",
      "        stageKey: 'llm_reasoning',",
      "        title: '思考过程',",
      "        status: 'running',",
      '        content: delta,',
      '        visibleContent: delta',
      '      }]',
      '    }',
      '  }',
      '',
      '  return {',
      '    ...flow,',
      '    thinking: [{',
      '      ...stage,',
      "      status: 'running',",
      '      content: stage.content + delta,',
      '      visibleContent: stage.visibleContent + delta',
      '    }]',
      '  }',
      '}',
      '',
      'export const appendStreamingAnswerDelta = (',
      '  flow: AssistantResponseFlow,',
      '  delta: string',
      '): AssistantResponseFlow => ({',
      '  ...flow,',
      '  answer: {',
      '    ...flow.answer,',
      "    status: 'running',",
      '    content: flow.answer.content + delta,',
      '    visibleContent: flow.answer.visibleContent + delta',
      '  }',
      '})'
    ],
    comments: [
      {
        title: 'thinking 增量固定写入唯一一块思考文本',
        start: 5,
        end: 24,
        detail:
          '当前项目已经不再维护多个推理阶段。无论后端吐出多少 thinking_delta，前端都只会把它们持续追加到同一个 thinking[0] 上。'
      },
      {
        title: 'content 与 visibleContent 同步累加',
        start: 14,
        end: 16,
        detail:
          '在当前项目里，流式阶段 content 和 visibleContent 一起增长。最终完成时 finalizeStreamingResponseFlow 会统一把 visibleContent 收口为完整 content。'
      },
      {
        title: 'answer 区与 thinking 区分离维护',
        start: 22,
        end: 31,
        detail:
          '最终回答的流式增量完全写入 flow.answer，不混进 thinking 数组。这就是思考区和回答区能独立展示的根本原因。'
      }
    ],
    callers: [{ id: 'workspace-apply-stream-event', label: '由 applyStreamEventToAssistantMessage 调用' }],
    callees: []
  },
  {
    id: 'workspace-request-stream-api',
    title: '前端 NDJSON 流解析',
    symbol: 'requestWorkspaceChatStreamAPI',
    owner: 'servers/workspace.ts',
    file: 'apps/client/src/servers/workspace.ts',
    lookupHint: '搜索 `export const requestWorkspaceChatStreamAPI`',
    area: 'workspace-chat',
    layer: 'client-server',
    summary:
      '这是前端真正面向 workspace/chat/stream 的流式请求入口。它负责 fetch、reader.read、按行切分 NDJSON，并把事件逐条回调给调用方。',
    code: [
      'export const requestWorkspaceChatStreamAPI = async (',
      '  dto: WorkspaceChatInput,',
      '  options: { signal?: AbortSignal; onEvent: (event: WorkspaceChatStreamEvent) => void }',
      '): Promise<WorkspaceChatResult> => {',
      "  const response = await fetch(buildWorkspaceUrl('workspace/chat/stream'), {",
      "    method: 'POST',",
      "    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },",
      '    body: JSON.stringify(dto),',
      '    signal: options.signal',
      '  })',
      '',
      '  const reader = response.body.getReader()',
      '  const decoder = new TextDecoder()',
      "  let buffer = ''",
      '  let completedResult: WorkspaceChatResult | null = null',
      '',
      '  while (true) {',
      '    const { done, value } = await reader.read()',
      '    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })',
      '',
      "    const lines = buffer.split('\\n')",
      "    buffer = lines.pop() ?? ''",
      '',
      '    for (const line of lines) {',
      '      const event = parseWorkspaceChatStreamEvent(line)',
      '      if (!event) continue',
      '',
      '      options.onEvent(event)',
      "      if (event.type === 'completed') completedResult = event.data",
      '    }',
      '',
      '    if (done) break',
      '  }',
      '',
      '  const finalEvent = parseWorkspaceChatStreamEvent(buffer)',
      '  if (finalEvent) {',
      '    options.onEvent(finalEvent)',
      "    if (finalEvent.type === 'completed') completedResult = finalEvent.data",
      '  }',
      '',
      '  if (!completedResult) {',
      "    throw new Error('stream completed without final result')",
      '  }',
      '',
      '  return completedResult',
      '}'
    ],
    comments: [
      {
        title: '请求头明确声明 NDJSON',
        start: 5,
        end: 9,
        detail:
          'Accept: application/x-ndjson 告诉后端这是一个逐行事件流，而不是普通 JSON 响应。'
      },
      {
        title: 'buffer + split("\\n") 是流式逐行解析核心',
        start: 16,
        end: 30,
        detail:
          '每次 reader.read() 拿到的并不一定是完整一行，所以代码用 buffer 累积文本，再按换行切开，最后把残留的半行继续留到下一轮。'
      },
      {
        title: 'completed 只记录最终结果，不直接结束循环',
        start: 26,
        end: 27,
        detail:
          '这里不会因为收到 completed 就立刻 break，而是继续按流读取到 done，避免丢失同一个 chunk 中尾部残留的数据。'
      },
      {
        title: '最后一段残留 buffer 还要再补解析一次',
        start: 33,
        end: 36,
        detail:
          '如果最后一条事件刚好没有换行符，只有在 done 之后解析剩余 buffer 才不会漏掉它。'
      }
    ],
    callers: [{ id: 'workspace-stream-assistant-response', label: '由 streamAssistantResponse 调用' }],
    callees: [{ id: 'workspace-controller-chat-stream', label: '请求后端 chat/stream' }]
  },
  {
    id: 'workspace-controller-chat-stream',
    title: '后端 chat/stream 控制器',
    symbol: 'chatStream',
    owner: 'workspace.controller.ts',
    file: 'apps/server/src/modules/workspace/workspace.controller.ts',
    lookupHint: '搜索 `async chatStream(`',
    area: 'workspace-chat',
    layer: 'controller',
    summary:
      '这个控制器负责把 WorkspaceService.chatStream 产生的事件序列包装成真正的 NDJSON HTTP 响应。',
    code: [
      'async chatStream(',
      '  @Body() dto: WorkspaceChatDto,',
      '  @Req() request: StreamingRequest,',
      '  @Res() response: StreamingResponse',
      '): Promise<void> {',
      '  const abortController = new AbortController()',
      "  request.on('close', () => {",
      '    if (!response.writableEnded) {',
      '      abortController.abort()',
      '    }',
      '  })',
      '',
      '  response.status(200)',
      "  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')",
      "  response.setHeader('Cache-Control', 'no-cache, no-transform')",
      "  response.setHeader('Connection', 'keep-alive')",
      '  response.flushHeaders?.()',
      '',
      '  try {',
      '    for await (const event of this.workspaceService.chatStream(dto, {',
      '      signal: abortController.signal',
      '    })) {',
      '      if (abortController.signal.aborted) break',
      '      response.write(`${JSON.stringify(event)}\\n`)',
      '    }',
      '  } finally {',
      '    response.end()',
      '  }',
      '}'
    ],
    comments: [
      {
        title: '连接关闭时中止下游服务流',
        start: 6,
        end: 11,
        detail:
          '浏览器一旦断开连接，控制器会立刻 abort。这样 WorkspaceService 和更下游的 LLM streaming 都能及时停止，不再继续白跑。'
      },
      {
        title: 'HTTP 响应被声明成 NDJSON 流',
        start: 13,
        end: 17,
        detail:
          '这几行头部是整个“边生成边展示”链路能成立的基础。如果这里返回普通 JSON，前端只能等整段响应结束后再统一解析。'
      },
      {
        title: '每个事件都独立写成一行 JSON',
        start: 19,
        end: 24,
        detail:
          'response.write(`${JSON.stringify(event)}\\n`) 使前端可以天然按行分割，每一行就是一个完整的 WorkspaceChatStreamEvent。'
      }
    ],
    callers: [{ id: 'workspace-request-stream-api', label: '前端 fetch 到这个接口' }],
    callees: [{ id: 'workspace-service-chat-stream', label: '继续进入服务层事件流' }]
  },
  {
    id: 'workspace-service-prepare-context',
    title: '准备聊天上下文并落 user 消息',
    symbol: 'prepareChatContext',
    owner: 'workspace.service.ts',
    file: 'apps/server/src/modules/workspace/workspace.service.ts',
    lookupHint: '搜索 `private async prepareChatContext`',
    area: 'workspace-chat',
    layer: 'service',
    summary:
      'prepareChatContext 决定这次聊天究竟挂在哪个 conversation 下，以及这条 user 消息何时写库。',
    code: [
      'private async prepareChatContext(dto: WorkspaceChatInput): Promise<PreparedChatContext> {',
      '  const incomingQuery = dto.query.trim()',
      '  if (!incomingQuery) {',
      "    throw new BadRequestException('query cannot be empty')",
      '  }',
      '',
      '  const conversation = dto.conversationId',
      '    ? await this.findConversationEntity(dto.conversationId)',
      '    : await this.workspaceConversationRepo.save(',
      '        this.workspaceConversationRepo.create({',
      '          title: buildConversationTitle(incomingQuery),',
      '          model: null',
      '        })',
      '      )',
      '',
      '  const promptCapabilities = buildPromptCapabilities(dto.think)',
      '  const query = dto.regenerate',
      '    ? await this.prepareConversationRegenerate(conversation.id)',
      '    : incomingQuery',
      '',
      '  if (!dto.regenerate) {',
      '    await this.workspaceMessageRepo.save(',
      '      this.workspaceMessageRepo.create({',
      '        conversationId: conversation.id,',
      "        role: 'user',",
      '        content: query,',
      '        citations: null,',
      '        model: null,',
      '        latencyMs: null,',
      '        reasoningSteps: null,',
      '        promptCapabilities',
      '      })',
      '    )',
      '  }',
      '',
      '  return { conversation, promptCapabilities, query }',
      '}'
    ],
    comments: [
      {
        title: '这里决定会话是否新建',
        start: 7,
        end: 14,
        detail:
          '如果 dto 带了 conversationId，就加载既有会话；否则直接创建一个新会话。也就是说，会话归属在服务层最终定稿，而不是由前端 URL 决定。'
      },
      {
        title: 'regenerate 会复用上一条用户问题',
        start: 16,
        end: 19,
        detail:
          '当 dto.regenerate 为 true 时，本次 query 不用前端传入文本，而是通过 prepareConversationRegenerate 回溯当前会话里最后一条用户消息。'
      },
      {
        title: '普通发送先落 user 消息',
        start: 20,
        end: 33,
        detail:
          '只要不是 regenerate，这里就会在 assistant 回复出现前先写入 user 消息。这样数据库里的消息顺序与前端占位顺序保持一致。'
      }
    ],
    callers: [{ id: 'workspace-service-chat-stream', label: 'chatStream 首先调用它准备上下文' }],
    callees: [{ id: 'workspace-service-chat-stream', label: '把返回的 context 继续交给 chatStream' }]
  },
  {
    id: 'workspace-service-chat-stream',
    title: '工作台服务层事件流',
    symbol: 'chatStream',
    owner: 'workspace.service.ts',
    file: 'apps/server/src/modules/workspace/workspace.service.ts',
    lookupHint: '搜索 `async *chatStream(`',
    area: 'workspace-chat',
    layer: 'service',
    summary:
      '这是服务端工作台主链路的中枢：它消费 KnowledgeService 的问答事件流，同时累计 answer 与 reasoningSteps，最后把最终结果落库并发 completed。',
    code: [
      'async *chatStream(',
      '  dto: WorkspaceChatInput,',
      '  options: { signal?: AbortSignal } = {}',
      '): AsyncGenerator<WorkspaceChatStreamEvent> {',
      '  const context = await this.prepareChatContext(dto)',
      '  const streamResult = await this.knowledgeService.streamAskKnowledge(',
      '    {',
      '      query: context.query,',
      '      knowledgeBaseId: dto.knowledgeBaseId,',
      '      topK: 4,',
      '      think: dto.think',
      '    },',
      '    { signal: options.signal }',
      '  )',
      '',
      '  const reasoningSteps: KnowledgeReasoningStep[] = []',
      "  let answer = ''",
      '',
      '  for await (const event of streamResult.stream) {',
      '    if (options.signal?.aborted) return',
      '',
      '    switch (event.type) {',
      "      case 'thinking_delta':",
      "        appendReasoningDelta(reasoningSteps, event.delta)",
      '        yield event',
      '        break',
      "      case 'answer_delta':",
      "        answer += event.delta",
      '        yield event',
      '        break',
      '    }',
      '  }',
      '',
      '  const finalResult = await this.persistAssistantResponse({',
      '    conversation: context.conversation,',
      '    query: context.query,',
      '    promptCapabilities: context.promptCapabilities,',
      '    answer: answer.trim(),',
      '    sources: streamResult.sources,',
      '    model: streamResult.model,',
      '    reasoningSteps: normalizePersistedReasoningSteps(reasoningSteps),',
      '    latencyMs: Date.now()',
      '  })',
      '',
      "  yield { type: 'completed', data: finalResult }",
      '}'
    ],
    comments: [
      {
        title: '先准备上下文，再接知识问答流',
        start: 5,
        end: 14,
        detail:
          '工作台服务并不直接调用 LLM。它先把会话上下文准备好，再把 query、knowledgeBaseId、think 交给 KnowledgeService.streamAskKnowledge。'
      },
      {
        title: '对下游事件流进行二次编排',
        start: 18,
        end: 28,
        detail:
          'KnowledgeService 产出的每个 event 会继续在这里被消费。真实代码里不仅 yield，还会同步累计 reasoningSteps 和 answer，用于最终落库。'
      },
      {
        title: 'completed 之前一定先持久化 assistant 结果',
        start: 30,
        end: 40,
        detail:
          '前端看到的 completed 并不是“模型结束了”这么简单，而是“assistant 结果已经被服务层整理完，并且已经写入数据库”的信号。'
      }
    ],
    callers: [{ id: 'workspace-controller-chat-stream', label: '由控制器逐个写成 NDJSON' }],
    callees: [
      { id: 'workspace-service-prepare-context', label: '准备会话与 user 消息' },
      { id: 'knowledge-service-stream-ask', label: '进入知识问答流' }
    ]
  },
  {
    id: 'knowledge-service-stream-ask',
    title: '知识问答流入口',
    symbol: 'streamAskKnowledge',
    owner: 'knowledge.service.ts',
    file: 'apps/server/src/modules/knowledge/knowledge.service.ts',
    lookupHint: '搜索 `async streamAskKnowledge(`',
    area: 'workspace-chat',
    layer: 'service',
    summary:
      'KnowledgeService 在这里做的是“RAG 前置编排”：先完成知识库存在性校验与召回，再把 sources 和 stream 一起返回给工作台服务层。',
    code: [
      'async streamAskKnowledge(',
      '  dto: KnowledgeAskStreamInput,',
      '  options: { signal?: AbortSignal } = {}',
      '): Promise<KnowledgeAskStream> {',
      '  const query = dto.query.trim()',
      '  if (!query) {',
      "    throw new BadRequestException('query cannot be empty')",
      '  }',
      '',
      '  await this.ensureKnowledgeBaseExists(dto.knowledgeBaseId)',
      '',
      '  const topK = normalizeTopK(dto.topK)',
      '  const sources = await this.retrieveKnowledge(dto.knowledgeBaseId, query, topK)',
      '',
      '  return {',
      '    sources,',
      '    model: this.knowledgeQaService.getModelName(),',
      '    stream: this.knowledgeQaService.streamAnswerQuestion(query, sources, {',
      '      includeReasoning: dto.think,',
      '      signal: options.signal',
      '    })',
      '  }',
      '}'
    ],
    comments: [
      {
        title: '这里不是直接问模型，而是先做召回',
        start: 10,
        end: 13,
        detail:
          'KnowledgeService 的核心角色是把 query 先送进 retrieveKnowledge，拿到 sources，再把 query + sources 一起交给 LLM 层。'
      },
      {
        title: '返回值同时包含 sources、model 和 stream',
        start: 15,
        end: 21,
        detail:
          '工作台服务层最终落库时既需要增量流，也需要最终 sources 和 model，所以这里返回的是一个组合结构，不只是 AsyncGenerator 本身。'
      }
    ],
    callers: [{ id: 'workspace-service-chat-stream', label: '由 WorkspaceService.chatStream 调用' }],
    callees: [
      { id: 'knowledge-service-retrieve', label: '先做 RAG 召回' },
      { id: 'knowledge-qa-stream-answer', label: '再进入 LLM 流式回答' }
    ]
  },
  {
    id: 'knowledge-qa-stream-answer',
    title: 'LLM 流式回答入口',
    symbol: 'streamAnswerQuestion',
    owner: 'knowledge-qa.service.ts',
    file: 'apps/server/src/modules/knowledge/composables/knowledge-qa.service.ts',
    lookupHint: '搜索 `async streamAnswerQuestion(`',
    area: 'streaming-thinking',
    layer: 'llm',
    summary:
      '这是最接近 LLM 的地方。它会直接消费模型的 streamV2 事件；普通模式把 text-delta 映射成 answer_delta，think 模式则要求模型输出 `## Thinking` / `## Answer` 两段 Markdown，再由轻量状态机拆成 thinking_delta 与 answer_delta。',
    code: [
      'async streamAnswerQuestion(',
      '  query: string,',
      '  hits: KnowledgeSearchHit[],',
      '  options: { includeReasoning?: boolean; signal?: AbortSignal } = {}',
      '): Promise<KnowledgeQaStreamResult> {',
      '  const includeReasoning = Boolean(options.includeReasoning)',
      '  const stream = this.getClient().streamV2([',
      '    { role: "system", content: buildKnowledgeQaStreamingSystemPrompt(hits.length > 0) },',
      '    { role: "user", content: buildKnowledgeQaStreamingUserPrompt(query, hits, includeReasoning) }',
      '  ], { signal: options.signal } as never)',
      '',
      '  async function *run(): AsyncGenerator<KnowledgeQaStreamEvent> {',
      '    const sectionStreamState = includeReasoning ? createKnowledgeQaSectionStreamState() : null',
      '',
      '    for await (const event of stream) {',
      '      const delta = extractStreamingTextDelta(event)',
      '      if (!delta) continue',
      '',
      '      if (!sectionStreamState) {',
      "        yield { type: 'answer_delta', delta }",
      '        continue',
      '      }',
      '',
      '      for (const sectionEvent of parseKnowledgeQaSectionedDelta(sectionStreamState, delta)) {',
      '        yield sectionEvent',
      '      }',
      '    }',
      '',
      '    if (sectionStreamState) {',
      '      for (const sectionEvent of flushKnowledgeQaSectionedDelta(sectionStreamState)) {',
      '        yield sectionEvent',
      '      }',
      '    }',
      '  }',
      '',
      '  return { stream: run(), totalTokens }',
      '}'
    ],
    comments: [
      {
        title: '是否开启 reasoning 在这里分流',
        start: 6,
        end: 10,
        detail:
          'think 模式不会在前端实现，而是在这里通过不同的 system prompt / user prompt 协议，要求模型输出可解析的结构化流。'
      },
      {
        title: '普通模式只产 answer_delta',
        start: 16,
        end: 19,
        detail:
          '如果 includeReasoning 为 false，函数根本不会经过解析器，而是把模型文本直接转成 answer_delta 连续向上游吐出。'
      },
      {
        title: 'think 模式走 Markdown 分段拆流',
        start: 22,
        end: 28,
        detail:
          '模型输出先被 extractStreamingTextDelta 提取为 text-delta，再由轻量状态机按 `## Thinking` 和 `## Answer` 两段标题拆成 thinking_delta 与 answer_delta。'
      }
    ],
    callers: [{ id: 'knowledge-service-stream-ask', label: '由 KnowledgeService.streamAskKnowledge 调用' }],
    callees: [{ id: 'workspace-apply-stream-event', label: '最终事件会被前端映射进 responseFlow' }]
  },
  {
    id: 'documents-submit-upload',
    title: '文档页上传提交',
    symbol: 'submitUpload',
    owner: 'documents.vue',
    file: 'apps/client/src/views/admin/knowledge/documents.vue',
    lookupHint: '搜索 `const submitUpload = async () => {`',
    area: 'knowledge-admin',
    layer: 'view',
    summary:
      '这是知识库后台“新建文档”对话框真正提交的地方，它把 storagePath、chunkStrategy 和 chunkConfig 打包后交给文档 composable。',
    code: [
      'const submitUpload = async () => {',
      '  const payload: KnowledgeDocumentUploadForm = {',
      "    name: uploadName.value.trim() || '新文档',",
      '    storagePath: uploadStoragePath.value.trim(),',
      '    chunkStrategy: uploadChunkStrategy.value,',
      '    chunkConfig: buildChunkConfigText(uploadChunkStrategy.value)',
      '  }',
      '',
      '  await createKnowledgeDocument(kbId.value, {',
      '    name: payload.name,',
      '    storagePath: payload.storagePath,',
      '    chunkStrategy: payload.chunkStrategy,',
      '    chunkConfig: payload.chunkConfig ? JSON.parse(payload.chunkConfig) : undefined',
      '  })',
      '',
      '  await loadKnowledgeBases()',
      '  resetUploadDialog()',
      '}'
    ],
    comments: [
      {
        title: '这里真正把 storagePath 送给后端',
        start: 2,
        end: 6,
        detail:
          '文档页不会把文件正文直接传给后端，而是把本地 storagePath 与 chunk 配置作为文档元信息提交。真正读取正文发生在后端重建 chunk 时。'
      },
      {
        title: 'chunkConfig 先序列化再反序列化',
        start: 8,
        end: 13,
        detail:
          '页面内部把不同分块策略统一先转成文本，再在提交前解析为对象，这样同一套表单能承载 fixed_size 和 structure_aware 两种配置。'
      }
    ],
    callers: [],
    callees: [{ id: 'knowledge-documents-create', label: '交给文档 composable 创建文档' }]
  },
  {
    id: 'knowledge-documents-create',
    title: '文档 composable 创建函数',
    symbol: 'createKnowledgeDocument',
    owner: 'useKnowledgeDocuments.ts',
    file: 'apps/client/src/composables/useKnowledgeDocuments.ts',
    lookupHint: '搜索 `const createKnowledgeDocument = async (`',
    area: 'knowledge-admin',
    layer: 'composable',
    summary:
      '这里负责把页面层 payload 交给前端请求层，并在成功后同步更新 documents 列表。',
    code: [
      'const createKnowledgeDocument = async (kbId: string, payload: CreateKnowledgeDocumentInput) => {',
      '  const response = await createKnowledgeDocumentAPI(kbId, {',
      '    name: payload.name.trim(),',
      '    storagePath: payload.storagePath.trim(),',
      "    chunkStrategy: payload.chunkStrategy?.trim() || undefined,",
      '    chunkConfig: payload.chunkConfig',
      '  })',
      '',
      '  if (!response.data) {',
      "    throw new Error('create document failed')",
      '  }',
      '',
      '  const created = response.data',
      '  documents.value = [created, ...documents.value]',
      '  return created',
      '}'
    ],
    comments: [
      {
        title: '页面层和请求层之间的状态桥',
        start: 1,
        end: 7,
        detail:
          'composable 在这里承担“请求 + 本地状态同步”职责：页面层不用自己处理 response.data，也不用自己维护 documents.value。'
      },
      {
        title: '成功后把新文档插到列表头部',
        start: 13,
        end: 15,
        detail:
          '这保证新建后的文档会第一时间出现在当前页面列表顶部，不需要再额外刷新整个列表。'
      }
    ],
    callers: [{ id: 'documents-submit-upload', label: '来自文档页 submitUpload' }],
    callees: [{ id: 'knowledge-service-create-document', label: '最终落到后端 createKnowledgeDocument' }]
  },
  {
    id: 'knowledge-service-create-document',
    title: '后端创建文档记录',
    symbol: 'createKnowledgeDocument',
    owner: 'knowledge.service.ts',
    file: 'apps/server/src/modules/knowledge/knowledge.service.ts',
    lookupHint: '搜索 `async createKnowledgeDocument(`',
    area: 'knowledge-admin',
    layer: 'service',
    summary:
      '这个函数负责为文档建立数据库记录，包括 storagePath、文件类型、chunkStrategy 和初始 chunkConfig，但它此时并不会立刻生成 chunk。',
    code: [
      'async createKnowledgeDocument(',
      '  knowledgeBaseId: string,',
      '  dto: CreateKnowledgeDocumentDto',
      '): Promise<KnowledgeDocument> {',
      '  const name = dto.name.trim()',
      '  const storagePath = dto.storagePath.trim()',
      '',
      '  ensureSupportedLocalTextFile(storagePath)',
      '  const fileStats = await this.readLocalFileStats(storagePath)',
      '  const fileType = inferFileTypeFromPath(storagePath)',
      '',
      '  const entity = this.knowledgeDocumentRepo.create({',
      '    knowledgeBaseId,',
      '    name,',
      "    sourceType: 'file',",
      '    storagePath,',
      '    fileType,',
      '    fileSizeBytes: String(fileStats.size),',
      "    chunkStrategy: dto.chunkStrategy?.trim() || 'fixed_size',",
      '    chunkConfig: dto.chunkConfig ?? { chunkSize: 500, overlap: 100 },',
      "    status: 'pending'",
      '  })',
      '',
      '  const created = await this.knowledgeDocumentRepo.save(entity)',
      '  return toKnowledgeDocument(created)',
      '}'
    ],
    comments: [
      {
        title: '这里只创建文档记录，不做切块',
        start: 8,
        end: 10,
        detail:
          'storagePath 会先被校验并写进文档记录，但真正读取正文、切块和生成 embedding 要等到 rebuildDocumentChunks 执行时才发生。'
      },
      {
        title: 'chunk 配置在文档记录阶段就定稿',
        start: 12,
        end: 20,
        detail:
          '文档记录里已经包含 chunkStrategy 和 chunkConfig，这样后续任何一次 rebuild 都可以复用当前保存的分块策略。'
      }
    ],
    callers: [{ id: 'knowledge-documents-create', label: '由前端 createKnowledgeDocumentAPI 触发' }],
    callees: [{ id: 'knowledge-service-rebuild-chunks', label: '后续通常会在文档页触发分块重建' }]
  },
  {
    id: 'knowledge-service-rebuild-chunks',
    title: '重建 chunk 与 embedding',
    symbol: 'rebuildDocumentChunks',
    owner: 'knowledge.service.ts',
    file: 'apps/server/src/modules/knowledge/knowledge.service.ts',
    lookupHint: '搜索 `async rebuildDocumentChunks(`',
    area: 'knowledge-admin',
    layer: 'service',
    summary:
      '这是知识库后台最关键的功能之一：读取 storagePath 对应的真实文件，按当前 chunk 配置切分文本，生成 embedding，并用事务重建 chunk 表。',
    code: [
      'async rebuildDocumentChunks(documentId: string): Promise<KnowledgeChunk[]> {',
      '  const document = await this.knowledgeDocumentRepo.findOne({ where: { id: documentId } })',
      '',
      "  await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'processing' })",
      '',
      '  try {',
      '    const rawContent = await this.loadDocumentContent(document)',
      '    const config = (document.chunkConfig ?? {}) as Record<string, unknown>',
      '    const chunkSize = Number(config.chunkSize ?? 500)',
      '    const overlap = Number(config.overlap ?? 100)',
      '    const parts = await splitText(rawContent, chunkSize, overlap)',
      '    const embeddings = await this.embeddingService.embedChunks(parts)',
      '',
      '    await this.dataSource.transaction(async (manager) => {',
      '      await manager.delete(KnowledgeChunkEntity, { documentId })',
      '      // 重新写入 chunk 与 embedding',
      '    })',
      '',
      '    return items.map(toKnowledgeChunk)',
      '  } catch (error) {',
      "    await this.knowledgeDocumentRepo.update({ id: documentId }, { status: 'failed' })",
      '    throw error',
      '  }',
      '}'
    ],
    comments: [
      {
        title: '状态先切到 processing',
        start: 4,
        end: 4,
        detail:
          '文档页上看到的 pending / processing / indexed / failed 状态，就是由这里的状态切换驱动出来的。'
      },
      {
        title: '真正读取文件正文发生在这里',
        start: 7,
        end: 11,
        detail:
          'loadDocumentContent 会从 storagePath 读取真实 txt / md 文件内容，然后按当前 chunk 配置切分文本。此前 createKnowledgeDocument 并没有读正文。'
      },
      {
        title: 'embedding 生成与 chunk 重建绑定在一个流程里',
        start: 11,
        end: 17,
        detail:
          '切分出的每个文本块都会先走 embedChunks，再在事务中先删旧 chunk、再写新 chunk，避免旧数据残留。'
      },
      {
        title: '任一步失败都回写 failed',
        start: 19,
        end: 21,
        detail:
          '这样后台页面可以准确知道本次 rebuild 没有完成，而不是停留在 processing 状态里卡住。'
      }
    ],
    callers: [{ id: 'knowledge-service-create-document', label: '文档记录创建后常配合这个流程使用' }],
    callees: [
      { id: 'knowledge-service-retrieve', label: '重建后的 chunk 会被召回层使用' },
      { id: 'vector-store-similarity-search', label: '向量召回最终会读取新 embedding' }
    ]
  },
  {
    id: 'knowledge-service-retrieve',
    title: '混合召回入口',
    symbol: 'retrieveKnowledge',
    owner: 'knowledge.service.ts',
    file: 'apps/server/src/modules/knowledge/knowledge.service.ts',
    lookupHint: '搜索 `private async retrieveKnowledge(`',
    area: 'knowledge-admin',
    layer: 'service',
    summary:
      'retrieveKnowledge 把关键词召回和向量召回合并成当前项目的最小 RAG 召回层。',
    code: [
      'private async retrieveKnowledge(',
      '  knowledgeBaseId: string | undefined,',
      '  query: string,',
      '  topK = 20',
      '): Promise<KnowledgeSearchHit[]> {',
      '  const keywordHits = await this.keywordRecall(knowledgeBaseId, query, topK)',
      '  const vectorHits = await this.vectorRecall(knowledgeBaseId, query, topK)',
      '',
      '  return this.mergeHits(keywordHits, vectorHits, topK)',
      '}'
    ],
    comments: [
      {
        title: '关键词召回与向量召回并行存在',
        start: 6,
        end: 8,
        detail:
          '当前版本不是只走 keyword，也不是只走 vector，而是两条召回链都跑，再由 mergeHits 做融合。'
      },
      {
        title: '这里是当前项目 RAG 的最小入口',
        start: 9,
        end: 9,
        detail:
          '如果你以后要讲“当前 RAG 项目不含检索优化版”，retrieveKnowledge 就是最适合拿来说明当前基础检索策略的函数。'
      }
    ],
    callers: [{ id: 'knowledge-service-stream-ask', label: '聊天问答流先调用它做召回' }],
    callees: [{ id: 'vector-store-similarity-search', label: '向量召回最终会走这里' }]
  },
  {
    id: 'vector-store-similarity-search',
    title: 'PGVector 向量召回',
    symbol: 'similaritySearchWithScore',
    owner: 'knowledge-vector-store.service.ts',
    file: 'apps/server/src/modules/knowledge/composables/knowledge-vector-store.service.ts',
    lookupHint: '搜索 `async similaritySearchWithScore(`',
    area: 'knowledge-admin',
    layer: 'storage',
    summary:
      '这是当前项目向量检索最底层的调用点。它直接把 query 送进 PGVectorStore，并根据 knowledgeBaseId 决定是否做作用域过滤。',
    code: [
      'async similaritySearchWithScore(',
      '  query: string,',
      '  limit: number,',
      '  knowledgeBaseId?: string',
      '): Promise<[Document, number][]> {',
      '  const store = await this.getStore()',
      '  if (!knowledgeBaseId) {',
      '    return store.similaritySearchWithScore(query, limit)',
      '  }',
      '',
      '  return store.similaritySearchWithScore(query, limit, { knowledgeBaseId })',
      '}'
    ],
    comments: [
      {
        title: '这里是真正访问向量库的位置',
        start: 6,
        end: 11,
        detail:
          'KnowledgeService.vectorRecall 最终会落到这里。也就是说，只要你要讲向量召回的真实执行点，就要定位到这个函数。'
      },
      {
        title: 'knowledgeBaseId 决定是否做 scoped 检索',
        start: 7,
        end: 11,
        detail:
          '如果没有指定 knowledgeBaseId，就会在整个向量表中做相似度搜索；如果指定了，就会只在对应知识库作用域内召回。'
      }
    ],
    callers: [{ id: 'knowledge-service-retrieve', label: '由 retrieveKnowledge 的 vectorRecall 使用' }],
    callees: []
  }
]
