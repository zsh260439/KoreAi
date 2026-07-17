<script setup lang="ts">
import {
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Library,
  MessageSquareText,
  PanelRight,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  X,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, ref } from "vue";

import ShiningText from "@/components/ui/ShiningText.vue";
import WorkspaceMark from "@/views/workspace/components/content/WorkspaceMark.vue";

type ViewKey = "chat" | "knowledge" | "trace";
type DrawerTab = "evidence" | "query" | "run";

const activeView = ref<ViewKey>("chat");
const sidebarCollapsed = ref(false);
const drawerOpen = ref(false);
const drawerTab = ref<DrawerTab>("evidence");
const selectedSource = ref(0);
const prompt = ref("");
const deepThinking = ref(true);
const generating = ref(false);
const generationStage = ref(0);
const configOpen = ref(true);
let generationTimer = 0;

const sources = [
  {
    id: "01",
    name: "energy_control_manual.pdf",
    position: "第 14 页 · 阈值控制",
    score: 98.8,
    content:
      "当负荷率达到 80% 时，由 energy_supervisor 在 2 小时内完成核验、升级与结果留痕。",
    matchedBy: "BM25 + 向量",
    bm25Score: 24.182,
    vectorScore: 85.683,
    fusedScore: 31.42,
    ceScore: 0.982,
    evidenceScore: 24.4,
  },
  {
    id: "02",
    name: "operations_policy.md",
    position: "第 3.2 节 · 响应流程",
    score: 91.4,
    content:
      "告警进入黄色区间后，值班人员先复核数据完整性，再交由能源主管确认处置。",
    matchedBy: "BM25 + 向量",
    bm25Score: 18.73,
    vectorScore: 79.24,
    fusedScore: 27.18,
    ceScore: 0.914,
    evidenceScore: 19.8,
  },
  {
    id: "03",
    name: "duty_matrix.docx",
    position: "表 6 · 责任矩阵",
    score: 87.1,
    content:
      "能源主管负责阈值确认，运行值班员负责执行，质量负责人完成复盘归档。",
    matchedBy: "向量",
    bm25Score: null,
    vectorScore: 76.51,
    fusedScore: 20.06,
    ceScore: 0.871,
    evidenceScore: 17.3,
  },
  {
    id: "04",
    name: "energy_operation_log_2026.md",
    position: "第 18 节 · 执行记录",
    score: 82.6,
    content:
      "ENERGY-03 触发后，运行值班员应记录核验时间、处置动作与能源主管确认结果。",
    matchedBy: "BM25 + 向量",
    bm25Score: 13.42,
    vectorScore: 71.86,
    fusedScore: 18.73,
    ceScore: 0.826,
    evidenceScore: 15.9,
  },
  {
    id: "05",
    name: "quality_review_standard.pdf",
    position: "第 9 页 · 留痕要求",
    score: 78.9,
    content: "复核完成后必须保存原始告警、责任升级记录和最终处置结论。",
    matchedBy: "向量",
    bm25Score: null,
    vectorScore: 69.31,
    fusedScore: 16.85,
    ceScore: 0.789,
    evidenceScore: 14.6,
  },
  {
    id: "06",
    name: "control_threshold_catalog.xlsx",
    position: "工作表 2 · ENERGY-03",
    score: 75.3,
    content: "ENERGY-03：主控制阈值 80%，告警确认角色 energy_supervisor。",
    matchedBy: "BM25",
    bm25Score: 11.76,
    vectorScore: null,
    fusedScore: 15.22,
    ceScore: 0.753,
    evidenceScore: 14.1,
  },
  {
    id: "07",
    name: "incident_escalation_guide.docx",
    position: "第 4 节 · 升级时限",
    score: 71.8,
    content: "能源控制事件应在两小时窗口内完成数据确认和责任升级。",
    matchedBy: "向量",
    bm25Score: null,
    vectorScore: 65.72,
    fusedScore: 13.91,
    ceScore: 0.718,
    evidenceScore: 12.8,
  },
  {
    id: "08",
    name: "energy_roles.md",
    position: "职责定义 · 能源主管",
    score: 68.4,
    content: "energy_supervisor 对控制阈值和最终处置结论承担确认责任。",
    matchedBy: "BM25 + 向量",
    bm25Score: 9.84,
    vectorScore: 62.17,
    fusedScore: 12.64,
    ceScore: 0.684,
    evidenceScore: 11.9,
  },
];

const activeSource = computed(() => sources[selectedSource.value]!);
const generationLabels = [
  "理解问题与编号",
  "检索全库证据",
  "筛选可用片段",
  "组织最终回答",
];

function switchView(view: ViewKey) {
  activeView.value = view;
  drawerOpen.value = false;
}

function showDrawer(tab: DrawerTab, sourceIndex = selectedSource.value) {
  drawerTab.value = tab;
  selectedSource.value = sourceIndex;
  drawerOpen.value = true;
}

function previewGeneration() {
  if (generating.value) return;
  generating.value = true;
  generationStage.value = 0;
  window.clearInterval(generationTimer);
  generationTimer = window.setInterval(() => {
    if (generationStage.value < generationLabels.length - 1)
      generationStage.value += 1;
    else {
      window.clearInterval(generationTimer);
      window.setTimeout(() => {
        generating.value = false;
      }, 700);
    }
  }, 850);
}

onBeforeUnmount(() => window.clearInterval(generationTimer));
</script>

<template>
  <main class="studio" :class="{ 'is-collapsed': sidebarCollapsed }">
    <aside class="sidebar" aria-label="主导航">
      <header class="brand">
        <span class="brand-lockup"
          ><img src="/brand-logo.png" alt="" /><strong
            ><span>kore</span><em>Ai</em></strong
          ></span
        >
        <button
          type="button"
          :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <ChevronsRight v-if="sidebarCollapsed" :size="17" />
          <ChevronsLeft v-else :size="17" />
        </button>
      </header>

      <nav class="main-nav">
        <button
          :class="{ 'is-active': activeView === 'chat' }"
          type="button"
          @click="switchView('chat')"
        >
          <MessageSquareText :size="18" /><span>对话</span>
        </button>
        <button
          :class="{ 'is-active': activeView === 'knowledge' }"
          type="button"
          @click="switchView('knowledge')"
        >
          <Library :size="18" /><span>知识库</span>
        </button>
        <button
          :class="{ 'is-active': activeView === 'trace' }"
          type="button"
          @click="switchView('trace')"
        >
          <Workflow :size="18" /><span>链路追踪</span>
        </button>
      </nav>

      <template v-if="!sidebarCollapsed && activeView === 'chat'">
        <button class="new-chat" type="button">
          <Plus :size="17" />新建对话
        </button>
        <label class="sidebar-search"
          ><Search :size="15" /><input type="search" placeholder="筛选对话"
        /></label>
        <div class="history-list">
          <section>
            <h2>今天</h2>
            <button class="history-item is-selected" type="button">
              <span>负荷控制记录检查</span><time>刚刚</time></button
            ><button class="history-item" type="button">
              <span>PDF 入库结果复核</span><time>10:24</time></button
            ><button class="history-item" type="button">
              <span>质量报告差异对比</span><time>09:40</time>
            </button>
          </section>
          <section>
            <h2>昨天</h2>
            <button class="history-item" type="button">
              <span>检索结果抽样</span><time>昨天</time></button
            ><button class="history-item" type="button">
              <span>能源阈值核验</span><time>昨天</time>
            </button>
          </section>
        </div>
      </template>

      <div v-else-if="!sidebarCollapsed" class="section-context">
        <span>{{ activeView === "knowledge" ? "知识空间" : "最近追踪" }}</span>
        <button v-if="activeView === 'knowledge'" type="button">
          <Plus :size="15" />新建知识库
        </button>
        <button v-else class="is-current" type="button">
          负荷控制记录检查<small>3.0 秒 · 8 个证据</small>
        </button>
      </div>

      <div v-else class="collapsed-tools">
        <button type="button" aria-label="新建"><Plus :size="18" /></button
        ><button type="button" aria-label="搜索"><Search :size="17" /></button>
      </div>
      <footer class="sidebar-footer">
        <button type="button"><Settings :size="18" /><span>设置</span></button
        ><span class="avatar">ZS</span>
      </footer>
    </aside>

    <section v-if="activeView === 'chat'" class="workspace">
      <header class="page-header">
        <div>
          <h1>负荷控制记录检查</h1>
          <span>12 条消息</span>
        </div>
        <div class="header-actions">
          <button class="model-button" type="button">
            <Sparkles :size="15" />DeepSeek V4 Flash<ChevronDown
              :size="14"
            /></button
          ><button
            class="icon-button"
            type="button"
            aria-label="查看回答依据"
            @click="showDrawer('evidence')"
          >
            <PanelRight :size="18" />
          </button>
        </div>
      </header>
      <div class="message-scroll">
        <div class="message-column">
          <div class="date-rule"><span>今天 14:32</span></div>
          <article class="user-message">
            <span>你</span>
            <p>
              能源管理负荷控制记录 ENERGY-03 的核心阈值是多少，责任角色是谁？
            </p>
          </article>
          <article class="assistant-message">
            <header>
              <WorkspaceMark :size="38" :active="generating" /><strong
                >Kore</strong
              ><span>{{ generating ? "正在回答" : "回答完成 · 3.0 秒" }}</span>
            </header>
            <div v-if="generating" class="thinking-presence" aria-live="polite">
              <div>
                <ShiningText :text="generationLabels[generationStage]" /><span
                  >正在核对检索结果与回答依据</span
                >
              </div>
            </div>
            <template v-else
              ><div class="answer-body">
                <p>
                  ENERGY-03 的核心控制阈值是 <strong>80%</strong>，责任角色是
                  <strong>energy_supervisor</strong>。
                </p>
                <p>
                  达到阈值后，需要在
                  <strong>2 小时</strong
                  >内完成数据核验、责任升级和结果留痕。运行值班员负责执行，能源主管确认最终处置。
                </p>
              </div>
              <div class="citations">
                <span>参考来源 · {{ sources.length }}</span
                ><button
                  v-for="(source, index) in sources"
                  :key="source.id"
                  type="button"
                  @click="showDrawer('evidence', index)"
                >
                  {{ source.id }}
                </button>
              </div></template
            >
          </article>
          <section v-if="!generating" class="run-overview">
            <header>
              <h2>本次运行</h2>
              <button type="button" @click="showDrawer('run')">查看过程</button>
            </header>
            <div class="metrics">
              <button type="button" @click="showDrawer('run')">
                <strong>60</strong><small>候选片段</small></button
              ><button type="button" @click="showDrawer('run')">
                <strong>{{ sources.length }}</strong
                ><small>精排结果</small></button
              ><button type="button" @click="showDrawer('evidence')">
                <strong>{{ sources.length }}</strong
                ><small>召回证据</small></button
              ><button type="button" @click="showDrawer('run')">
                <strong>3.0<em>秒</em></strong
                ><small>总耗时</small>
              </button>
            </div>
            <div class="run-summary">
              <span><Check :size="15" />证据充分</span>
              <p>
                {{
                  sources.length
                }}
                个来源共同参与本次回答，完整保留所有召回结果。
              </p>
            </div>
          </section>
        </div>
      </div>
      <footer class="composer-area">
        <form class="composer" @submit.prevent="previewGeneration">
          <textarea
            v-model="prompt"
            rows="1"
            aria-label="发送消息"
            placeholder="继续追问，或输入 / 使用工具"
          ></textarea>
          <div class="composer-footer">
            <div>
              <button
                type="button"
                :class="{ 'is-on': deepThinking }"
                @click="deepThinking = !deepThinking"
              >
                <Brain :size="17" />深度思考</button
              ><button type="button"><BookOpen :size="17" />全库检索</button>
            </div>
            <button class="send-button" type="submit" aria-label="预览生成效果">
              <ArrowUp :size="18" />
            </button>
          </div>
        </form>
      </footer>
    </section>

    <section v-else-if="activeView === 'knowledge'" class="content-page">
      <header class="page-header">
        <div>
          <h1>知识库</h1>
          <span>文档、检索测试与运行配置</span>
        </div>
        <button class="primary-button" type="button">
          <Plus :size="16" />新建知识库
        </button>
      </header>
      <div class="page-scroll">
        <div class="knowledge-content">
          <section class="intro-line">
            <div>
              <h2>让资料成为可验证的回答依据</h2>
              <p>管理文档、检查入库结果，并在同一处调整全库搜索的运行方式。</p>
            </div>
            <dl>
              <div>
                <dt>知识库</dt>
                <dd>4</dd>
              </div>
              <div>
                <dt>文档</dt>
                <dd>219</dd>
              </div>
              <div>
                <dt>可检索片段</dt>
                <dd>1,842</dd>
              </div>
            </dl>
          </section>
          <section class="knowledge-list">
            <header>
              <h2>知识空间</h2>
              <label
                ><Search :size="15" /><input
                  type="search"
                  placeholder="搜索知识库"
              /></label>
            </header>
            <article>
              <div>
                <span class="library-mark">EN</span>
                <div>
                  <h3>能源运行制度</h3>
                  <p>阈值控制、职责矩阵与运行记录</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>文档</dt>
                  <dd>68</dd>
                </div>
                <div>
                  <dt>片段</dt>
                  <dd>542</dd>
                </div>
                <div>
                  <dt>更新</dt>
                  <dd>12 分钟前</dd>
                </div>
              </dl>
              <button type="button">进入</button>
            </article>
            <article>
              <div>
                <span class="library-mark">QA</span>
                <div>
                  <h3>质量管理</h3>
                  <p>季度报告、复核标准与异常闭环</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>文档</dt>
                  <dd>51</dd>
                </div>
                <div>
                  <dt>片段</dt>
                  <dd>418</dd>
                </div>
                <div>
                  <dt>更新</dt>
                  <dd>昨天</dd>
                </div>
              </dl>
              <button type="button">进入</button>
            </article>
            <article>
              <div>
                <span class="library-mark">OP</span>
                <div>
                  <h3>运维手册</h3>
                  <p>巡检流程、故障处理与升级路径</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>文档</dt>
                  <dd>100</dd>
                </div>
                <div>
                  <dt>片段</dt>
                  <dd>882</dd>
                </div>
                <div>
                  <dt>更新</dt>
                  <dd>07/15</dd>
                </div>
              </dl>
              <button type="button">进入</button>
            </article>
          </section>
          <section class="runtime-settings">
            <button
              class="settings-heading"
              type="button"
              @click="configOpen = !configOpen"
            >
              <span
                ><SlidersHorizontal :size="18" /><span
                  ><strong>全库运行配置</strong
                  ><small>用于未指定知识库的搜索</small></span
                ></span
              ><ChevronDown :size="17" :class="{ 'is-open': configOpen }" />
            </button>
            <Transition name="disclosure"
              ><div v-if="configOpen" class="settings-body">
                <div class="setting-group">
                  <h3>召回范围</h3>
                  <label
                    ><span>回答片段数<small>workspaceTopK</small></span
                    ><input value="4" /></label
                  ><label
                    ><span>预览片段数<small>previewTopK</small></span
                    ><input value="20" /></label
                  ><label
                    ><span>候选上限<small>maxCandidateLimit</small></span
                    ><input value="80"
                  /></label>
                </div>
                <div class="setting-group">
                  <h3>排序权重</h3>
                  <label
                    ><span>BM25<small>bm25Weight</small></span
                    ><input value="1.0" /></label
                  ><label
                    ><span>向量<small>vectorWeight</small></span
                    ><input value="1.0" /></label
                  ><label
                    ><span>回答温度<small>temperature</small></span
                    ><input value="0"
                  /></label>
                </div>
                <footer>
                  <span>最近保存于 07/17 14:32</span
                  ><button class="primary-button" type="button">
                    保存配置
                  </button>
                </footer>
              </div></Transition
            >
          </section>
        </div>
      </div>
    </section>

    <section v-else class="content-page trace-page">
      <header class="page-header">
        <div>
          <h1>链路追踪</h1>
          <span>从问题到回答，查看一次真实运行</span>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="查看详情"
          @click="showDrawer('run')"
        >
          <PanelRight :size="18" />
        </button>
      </header>
      <div class="page-scroll">
        <div class="trace-content">
          <header class="trace-title">
            <span>负荷控制记录检查</span>
            <h2>ENERGY-03 的核心阈值是多少，责任角色是谁？</h2>
            <div>
              <span>DeepSeek V4 Flash</span><span>3.0 秒</span
              ><span>1243 tokens</span><span class="pass">证据通过</span>
            </div>
          </header>
          <ol class="trace-flow">
            <li>
              <span class="step-dot">1</span>
              <div>
                <header>
                  <h3>请求</h3>
                  <time>0.0 秒</time>
                </header>
                <p>保留原始问题、全库搜索与深度思考状态。</p>
                <dl>
                  <div>
                    <dt>originalQuery</dt>
                    <dd>
                      能源管理负荷控制记录 ENERGY-03
                      的核心阈值是多少，责任角色是谁？
                    </dd>
                  </div>
                  <div>
                    <dt>knowledgeBaseId</dt>
                    <dd>全库</dd>
                  </div>
                  <div>
                    <dt>think</dt>
                    <dd>开启</dd>
                  </div>
                  <div>
                    <dt>rewrite</dt>
                    <dd>开启</dd>
                  </div>
                </dl>
              </div>
            </li>
            <li>
              <span class="step-dot">2</span>
              <div>
                <header>
                  <h3>查询理解</h3>
                  <time>0.1 秒</time>
                </header>
                <p>编号保持完整，查询未被改写。</p>
                <dl>
                  <div>
                    <dt>retrievalMode</dt>
                    <dd>exact_lookup</dd>
                  </div>
                  <div>
                    <dt>routeType</dt>
                    <dd>exact_lookup</dd>
                  </div>
                  <div>
                    <dt>routeSource</dt>
                    <dd>rule</dd>
                  </div>
                  <div>
                    <dt>routeConfidence</dt>
                    <dd>high</dd>
                  </div>
                  <div>
                    <dt>protectedTerms</dt>
                    <dd>ENERGY-03</dd>
                  </div>
                  <div>
                    <dt>llmIntent</dt>
                    <dd>阈值与责任角色核验</dd>
                  </div>
                </dl>
              </div>
            </li>
            <li>
              <span class="step-dot">3</span>
              <div>
                <header>
                  <h3>候选召回</h3>
                  <time>0.8 秒</time>
                </header>
                <p>BM25 与向量召回合并后形成 60 个候选。</p>
                <div class="trace-bars">
                  <span style="--value: 72%">BM25 · 10</span
                  ><span style="--value: 94%">Vector · 60</span>
                </div>
                <dl>
                  <div>
                    <dt>candidateLimit</dt>
                    <dd>80</dd>
                  </div>
                  <div>
                    <dt>ceCandidateCount</dt>
                    <dd>60</dd>
                  </div>
                  <div>
                    <dt>bm25Weight</dt>
                    <dd>1.0</dd>
                  </div>
                  <div>
                    <dt>vectorWeight</dt>
                    <dd>1.0</dd>
                  </div>
                  <div>
                    <dt>fallbackApplied</dt>
                    <dd>否</dd>
                  </div>
                  <div>
                    <dt>exactEntityMiss</dt>
                    <dd>否</dd>
                  </div>
                </dl>
              </div>
            </li>
            <li>
              <span class="step-dot">4</span>
              <div>
                <header>
                  <h3>证据筛选</h3>
                  <time>0.4 秒</time>
                </header>
                <p>
                  {{
                    sources.length
                  }}
                  个片段进入最终证据集，并全部保留在回答记录中。
                </p>
                <dl>
                  <div>
                    <dt>effectiveTopK</dt>
                    <dd>{{ sources.length }}</dd>
                  </div>
                  <div>
                    <dt>evidenceComplexity</dt>
                    <dd>high_constraint</dd>
                  </div>
                  <div>
                    <dt>evidenceCoverage</dt>
                    <dd>100%</dd>
                  </div>
                  <div>
                    <dt>evidenceExpansionApplied</dt>
                    <dd>否</dd>
                  </div>
                  <div>
                    <dt>evidenceGateStatus</dt>
                    <dd class="pass">pass</dd>
                  </div>
                </dl>
                <button
                  class="text-button"
                  type="button"
                  @click="showDrawer('evidence')"
                >
                  查看全部 {{ sources.length }} 个 chunk 分数与原文
                </button>
              </div>
            </li>
            <li>
              <span class="step-dot">5</span>
              <div>
                <header>
                  <h3>回答生成</h3>
                  <time>1.7 秒</time>
                </header>
                <p>证据覆盖 100%，最终回答记录 {{ sources.length }} 个来源。</p>
                <dl>
                  <div>
                    <dt>model</dt>
                    <dd>DeepSeek V4 Flash</dd>
                  </div>
                  <div>
                    <dt>latencyMs</dt>
                    <dd>3000</dd>
                  </div>
                  <div>
                    <dt>totalTokens</dt>
                    <dd>1243</dd>
                  </div>
                  <div>
                    <dt>reasoningSteps</dt>
                    <dd>3</dd>
                  </div>
                </dl>
                <blockquote>
                  核心控制阈值为 80%，责任角色为 energy_supervisor。
                </blockquote>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <Transition name="drawer"
      ><div
        v-if="drawerOpen"
        class="drawer-layer"
        @click.self="drawerOpen = false"
      >
        <aside class="drawer" aria-label="运行详情">
          <header class="drawer-header">
            <div><span>回答依据</span><strong>本次检索详情</strong></div>
            <button
              class="icon-button"
              type="button"
              aria-label="关闭"
              @click="drawerOpen = false"
            >
              <X :size="18" />
            </button>
          </header>
          <div class="drawer-tabs" role="tablist">
            <button
              v-for="tab in ['evidence', 'query', 'run'] as DrawerTab[]"
              :key="tab"
              type="button"
              :class="{ 'is-active': drawerTab === tab }"
              @click="drawerTab = tab"
            >
              {{ { evidence: "证据", query: "查询", run: "运行过程" }[tab] }}
            </button>
          </div>
          <div class="drawer-scroll">
            <template v-if="drawerTab === 'evidence'"
              ><div class="drawer-result-count">
                完整召回 {{ sources.length }} 个 chunk
              </div>
              <div class="source-index">
                <button
                  v-for="(source, index) in sources"
                  :key="source.id"
                  type="button"
                  :class="{ 'is-active': selectedSource === index }"
                  @click="selectedSource = index"
                >
                  {{ source.id }}
                </button>
              </div>
              <article class="source-detail">
                <header>
                  <FileText :size="19" />
                  <div>
                    <strong>{{ activeSource.name }}</strong
                    ><span>{{ activeSource.position }}</span>
                  </div>
                  <em>{{ activeSource.score }}</em>
                </header>
                <blockquote>{{ activeSource.content }}</blockquote>
                <dl class="score-grid">
                  <div>
                    <dt>matchedBy</dt>
                    <dd>{{ activeSource.matchedBy }}</dd>
                  </div>
                  <div>
                    <dt>bm25Score</dt>
                    <dd>{{ activeSource.bm25Score ?? "—" }}</dd>
                  </div>
                  <div>
                    <dt>vectorScore</dt>
                    <dd>{{ activeSource.vectorScore ?? "—" }}</dd>
                  </div>
                  <div>
                    <dt>fusedScore</dt>
                    <dd>{{ activeSource.fusedScore }}</dd>
                  </div>
                  <div>
                    <dt>ceScore</dt>
                    <dd>{{ activeSource.ceScore }}</dd>
                  </div>
                  <div>
                    <dt>evidenceScore</dt>
                    <dd>{{ activeSource.evidenceScore }}</dd>
                  </div>
                  <div>
                    <dt>chunkId</dt>
                    <dd>chunk-energy-{{ activeSource.id }}</dd>
                  </div>
                  <div>
                    <dt>documentId</dt>
                    <dd>doc-energy-{{ activeSource.id }}</dd>
                  </div>
                  <div>
                    <dt>sequence</dt>
                    <dd>{{ selectedSource + 1 }}</dd>
                  </div>
                  <div>
                    <dt>primaryTitle</dt>
                    <dd>{{ activeSource.position }}</dd>
                  </div>
                  <div>
                    <dt>matchedEvidenceTerms</dt>
                    <dd>ENERGY-03 · 80% · energy_supervisor</dd>
                  </div>
                  <div>
                    <dt>documentRole</dt>
                    <dd>
                      {{
                        selectedSource < 3
                          ? "primary_evidence"
                          : "supporting_evidence"
                      }}
                    </dd>
                  </div>
                </dl>
              </article></template
            >
            <template v-else-if="drawerTab === 'query'"
              ><section class="query-detail">
                <h3>查询输入</h3>
                <dl>
                  <div>
                    <dt>originalQuery</dt>
                    <dd>
                      能源管理负荷控制记录 ENERGY-03
                      的核心阈值是多少，责任角色是谁？
                    </dd>
                  </div>
                  <div>
                    <dt>normalizedQuery</dt>
                    <dd>
                      能源管理负荷控制记录 ENERGY-03
                      的核心阈值是多少,责任角色是谁?
                    </dd>
                  </div>
                  <div>
                    <dt>bm25Query</dt>
                    <dd>能源管理负荷控制记录 ENERGY-03 核心阈值 责任角色</dd>
                  </div>
                  <div>
                    <dt>vectorQuery</dt>
                    <dd>能源管理负荷控制记录 ENERGY-03 的核心阈值与责任角色</dd>
                  </div>
                </dl>
                <h3>检索决策</h3>
                <dl class="score-grid">
                  <div>
                    <dt>rewriteApplied</dt>
                    <dd>否</dd>
                  </div>
                  <div>
                    <dt>retrievalMode</dt>
                    <dd>exact_lookup</dd>
                  </div>
                  <div>
                    <dt>routeType</dt>
                    <dd>exact_lookup</dd>
                  </div>
                  <div>
                    <dt>routeSource</dt>
                    <dd>rule</dd>
                  </div>
                  <div>
                    <dt>routeConfidence</dt>
                    <dd>high</dd>
                  </div>
                  <div>
                    <dt>llmIntent</dt>
                    <dd>阈值与角色核验</dd>
                  </div>
                  <div>
                    <dt>bm25Weight</dt>
                    <dd>1.0</dd>
                  </div>
                  <div>
                    <dt>vectorWeight</dt>
                    <dd>1.0</dd>
                  </div>
                  <div>
                    <dt>bm25HitCount</dt>
                    <dd>10</dd>
                  </div>
                  <div>
                    <dt>vectorHitCount</dt>
                    <dd>60</dd>
                  </div>
                  <div>
                    <dt>candidateLimit</dt>
                    <dd>80</dd>
                  </div>
                  <div>
                    <dt>ceCandidateCount</dt>
                    <dd>60</dd>
                  </div>
                  <div>
                    <dt>effectiveTopK</dt>
                    <dd>{{ sources.length }}</dd>
                  </div>
                  <div>
                    <dt>fallbackApplied</dt>
                    <dd>否</dd>
                  </div>
                  <div>
                    <dt>exactEntityMiss</dt>
                    <dd>否</dd>
                  </div>
                  <div>
                    <dt>evidenceComplexity</dt>
                    <dd>high_constraint</dd>
                  </div>
                  <div>
                    <dt>evidenceCoverage</dt>
                    <dd>100%</dd>
                  </div>
                  <div>
                    <dt>evidenceGateStatus</dt>
                    <dd class="pass">pass</dd>
                  </div>
                </dl>
              </section></template
            >
            <ol v-else class="run-steps">
              <li v-for="(label, index) in generationLabels" :key="label">
                <i></i
                ><span
                  ><strong>{{ label }}</strong
                  ><small>{{
                    [
                      "保留编号 ENERGY-03",
                      "BM25 10 · 向量 60",
                      `${sources.length} 个片段进入精排`,
                      `${sources.length} 个来源写入回答记录`,
                    ][index]
                  }}</small></span
                ><time>{{ ["0.1", "0.8", "0.4", "1.7"][index] }} 秒</time>
              </li>
            </ol>
          </div>
        </aside>
      </div></Transition
    >
  </main>
</template>

<style scoped>
.studio {
  --paper: #fafaf7;
  --surface: #fff;
  --side: #f8f8f5;
  --ink: #191918;
  --text: #44443f;
  --muted: #777770;
  --line: #e8e8e2;
  --strong: #d8d8d1;
  --accent: #5b5bf7;
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  font-family:
    ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  transition: grid-template-columns 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.studio.is-collapsed {
  grid-template-columns: 64px minmax(0, 1fr);
}
button,
input,
textarea {
  color: inherit;
  font: inherit;
}
button {
  border: 0;
  background: none;
  cursor: pointer;
}
.sidebar {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: var(--side);
}
.brand {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  padding: 0 13px;
}
.brand img {
  width: 112px;
  height: auto;
  object-fit: contain;
  object-position: left;
}
.brand button,
.icon-button,
.collapsed-tools button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  color: #60605b;
  transition:
    background 0.16s,
    transform 0.12s;
}
.brand button:hover,
.icon-button:hover,
.collapsed-tools button:hover {
  background: #efefea;
}
.brand button:active,
.icon-button:active {
  transform: scale(0.96);
}
.main-nav {
  display: grid;
  gap: 3px;
  padding: 7px 9px;
}
.main-nav button,
.sidebar-footer button {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 8px;
  color: #575752;
  white-space: nowrap;
}
.main-nav button:hover,
.main-nav button.is-active,
.sidebar-footer button:hover {
  background: #efefea;
  color: var(--ink);
}
.main-nav button.is-active {
  border: 1px solid var(--line);
  background: var(--surface);
}
.main-nav button.is-active svg {
  color: var(--accent);
}
.new-chat {
  display: flex;
  min-height: 43px;
  align-items: center;
  gap: 9px;
  margin: 15px 13px 11px;
  padding: 0 13px;
  border: 1px solid var(--strong);
  border-radius: 10px;
  background: var(--surface);
}
.sidebar-search {
  display: flex;
  height: 36px;
  align-items: center;
  gap: 8px;
  margin: 0 13px 17px;
  padding: 0 9px;
  border-bottom: 1px solid var(--strong);
  color: var(--muted);
}
.sidebar-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
}
.history-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 0 8px 22px;
}
.history-list section + section {
  margin-top: 25px;
}
.history-list h2 {
  margin: 0 10px 7px;
  color: var(--muted);
  font:
    500 12px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.history-item {
  display: grid;
  width: 100%;
  min-height: 40px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 8px;
  text-align: left;
}
.history-item:hover,
.history-item.is-selected {
  background: #efefea;
}
.history-item.is-selected {
  color: #4d4dd1;
}
.history-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-item time {
  color: var(--muted);
  font-size: 11px;
}
.section-context {
  display: grid;
  gap: 8px;
  padding: 20px 12px;
}
.section-context > span {
  padding: 0 7px;
  color: var(--muted);
  font-size: 12px;
}
.section-context button {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--strong);
  border-radius: 9px;
  text-align: left;
}
.section-context button.is-current {
  display: grid;
  border-color: var(--line);
  background: #efefea;
}
.section-context small {
  color: var(--muted);
}
.collapsed-tools {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding-top: 12px;
}
.sidebar-footer {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding: 0 13px;
  border-top: 1px solid var(--line);
}
.avatar {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 1px solid var(--strong);
  border-radius: 50%;
  background: #fff;
  font-size: 11px;
  font-weight: 700;
}
.is-collapsed .brand {
  min-height: 108px;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
  padding: 10px 0;
}
.is-collapsed .brand img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  object-position: left;
}
.is-collapsed .main-nav {
  justify-items: center;
  padding-inline: 0;
}
.is-collapsed .main-nav button {
  width: 40px;
  justify-content: center;
  padding: 0;
}
.is-collapsed .main-nav span,
.is-collapsed .sidebar-footer button span {
  display: none;
}
.is-collapsed .sidebar-footer {
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 8px 0;
}
.workspace,
.content-page {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto 1fr;
  background: radial-gradient(
    circle at 55% 5%,
    rgba(91, 91, 247, 0.035),
    transparent 27%
  );
}
.workspace {
  grid-template-rows: auto 1fr auto;
}
.page-header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  padding: 0 25px;
  border-bottom: 1px solid var(--line);
  background: rgba(250, 250, 247, 0.94);
}
.page-header > div:first-child {
  display: grid;
  gap: 3px;
}
.page-header h1 {
  margin: 0;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.page-header span {
  color: var(--muted);
  font-size: 12px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.model-button,
.primary-button {
  display: flex;
  height: 36px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
.model-button {
  color: #55554f;
  font-size: 12px;
}
.model-button svg:first-child {
  color: var(--accent);
}
.primary-button {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
}
.message-scroll,
.page-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.message-column {
  width: min(820px, calc(100% - 48px));
  margin: auto;
  padding: 44px 0 170px;
}
.date-rule {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 38px;
  color: var(--muted);
  font-size: 11px;
}
.date-rule:before,
.date-rule:after {
  height: 1px;
  flex: 1;
  background: var(--line);
  content: "";
}
.user-message {
  width: min(550px, 82%);
  margin-left: auto;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 11px 11px 3px 11px;
  background: rgba(255, 255, 255, 0.76);
}
.user-message > span {
  display: block;
  margin-bottom: 7px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
}
.user-message p,
.answer-body p {
  margin: 0;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  line-height: 1.85;
}
.assistant-message {
  margin-top: 42px;
}
.assistant-message > header {
  display: flex;
  align-items: center;
  gap: 9px;
}
.assistant-message > header > span:last-child {
  color: var(--muted);
  font-size: 11px;
}
.assistant-mark {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  color: var(--accent);
}
.assistant-mark.is-thinking {
  animation: mark-pulse 1.1s ease-in-out infinite;
}
.answer-body {
  display: grid;
  gap: 13px;
  margin-top: 20px;
  font-size: 16px;
}
.citations {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
}
.citations > span {
  margin-right: 3px;
  color: var(--muted);
  font-size: 11px;
}
.citations button,
.source-index button {
  width: 29px;
  height: 27px;
  border: 1px solid var(--strong);
  border-radius: 6px;
  background: #fff;
  color: var(--accent);
  font-size: 11px;
}
.thinking-presence {
  position: relative;
  display: flex;
  min-height: 92px;
  align-items: center;
  gap: 18px;
  margin-top: 18px;
  overflow: hidden;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.thinking-presence i {
  width: 48px;
  height: 48px;
  flex: none;
  border-radius: 45% 55% 58% 42%;
  background: radial-gradient(
    circle at 35% 35%,
    #c8c2ff 0,
    #7167e8 42%,
    rgba(91, 91, 247, 0.12) 72%
  );
  filter: blur(2px);
  animation: presence 2.2s ease-in-out infinite;
}
.thinking-presence div {
  display: grid;
  gap: 4px;
}
.thinking-presence span {
  color: var(--muted);
  font-size: 12px;
}
.run-overview {
  margin-top: 58px;
  border-top: 1px solid var(--line);
}
.run-overview > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 0;
}
.run-overview h2 {
  margin: 0;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.run-overview header button,
.text-button {
  color: var(--muted);
  font-size: 12px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.metrics button {
  display: grid;
  gap: 17px;
  padding: 28px 20px;
  text-align: left;
}
.metrics button + button {
  border-left: 1px solid var(--line);
}
.metrics strong {
  font:
    700 32px ui-serif,
    Georgia,
    serif;
}
.metrics em {
  margin-left: 3px;
  color: var(--muted);
  font-size: 12px;
  font-style: normal;
}
.metrics small {
  color: var(--muted);
}
.run-summary {
  display: flex;
  align-items: center;
  gap: 17px;
  padding: 17px 0;
}
.run-summary span {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 650;
}
.run-summary span svg,
.pass {
  color: #33855a;
}
.run-summary p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.composer-area {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 20px 24px 18px;
  background: linear-gradient(transparent, var(--paper) 26%);
}
.composer {
  width: min(820px, calc(100% - 48px));
  margin: auto;
  padding: 13px 15px 11px;
  border: 1px solid var(--strong);
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 7px 8px rgba(30, 30, 25, 0.06);
}
.composer textarea {
  width: 100%;
  min-height: 32px;
  resize: none;
  border: 0;
  outline: 0;
}
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.composer-footer > div {
  display: flex;
  gap: 6px;
}
.composer-footer button {
  display: flex;
  height: 31px;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border-radius: 7px;
  color: #696963;
  font-size: 12px;
}
.composer-footer button.is-on {
  background: #f0efff;
  color: #4d4dd1;
}
.composer-footer .send-button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 50%;
  background: #e8e8e3;
}
.composer-footer .send-button:hover {
  background: var(--accent);
  color: #fff;
}
.knowledge-content,
.trace-content {
  width: min(1080px, calc(100% - 64px));
  margin: auto;
  padding: 48px 0 90px;
}
.intro-line {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 70px;
  padding-bottom: 42px;
  border-bottom: 1px solid var(--line);
}
.intro-line h2 {
  max-width: 520px;
  margin: 0 0 13px;
  font:
    500 32px/1.25 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.intro-line p {
  max-width: 560px;
  margin: 0;
  color: var(--text);
  line-height: 1.7;
}
.intro-line dl {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
}
.intro-line dl > div {
  padding-left: 20px;
  border-left: 1px solid var(--line);
}
.intro-line dt {
  color: var(--muted);
  font-size: 12px;
}
.intro-line dd {
  margin: 10px 0 0;
  font:
    600 26px ui-serif,
    Georgia,
    serif;
}
.knowledge-list {
  padding: 37px 0;
}
.knowledge-list > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}
.knowledge-list h2,
.runtime-settings strong {
  margin: 0;
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.knowledge-list label {
  display: flex;
  height: 35px;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border-bottom: 1px solid var(--strong);
  color: var(--muted);
}
.knowledge-list input {
  border: 0;
  outline: 0;
  background: transparent;
}
.knowledge-list article {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) 1fr auto;
  align-items: center;
  gap: 35px;
  padding: 22px 4px;
  border-top: 1px solid var(--line);
}
.knowledge-list article:last-child {
  border-bottom: 1px solid var(--line);
}
.knowledge-list article > div:first-child {
  display: flex;
  align-items: center;
  gap: 15px;
}
.library-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  color: var(--accent);
  font-weight: 700;
}
.knowledge-list h3 {
  margin: 0 0 5px;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.knowledge-list p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.knowledge-list article dl {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
}
.knowledge-list dt {
  color: var(--muted);
  font-size: 10px;
}
.knowledge-list dd {
  margin: 5px 0 0;
  font-size: 12px;
}
.knowledge-list article > button {
  padding: 8px 12px;
  border: 1px solid var(--strong);
  border-radius: 7px;
  background: #fff;
}
.runtime-settings {
  border-top: 1px solid var(--strong);
  border-bottom: 1px solid var(--strong);
}
.settings-heading {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 20px 4px;
}
.settings-heading > span {
  display: flex;
  align-items: center;
  gap: 12px;
}
.settings-heading > span > span {
  display: grid;
  gap: 4px;
  text-align: left;
}
.settings-heading small {
  color: var(--muted);
  font-size: 11px;
}
.settings-heading > svg {
  transition: transform 0.2s;
}
.settings-heading > svg.is-open {
  transform: rotate(180deg);
}
.settings-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 38px;
  padding: 10px 4px 25px;
}
.setting-group h3 {
  margin: 0 0 9px;
  font-size: 13px;
}
.setting-group label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.setting-group label > span {
  display: grid;
  gap: 3px;
}
.setting-group small {
  color: var(--muted);
  font:
    10px ui-monospace,
    monospace;
}
.setting-group input {
  width: 80px;
  padding: 7px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  text-align: right;
}
.settings-body footer {
  display: flex;
  grid-column: 1/-1;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding-top: 7px;
  border-top: 1px solid var(--line);
}
.settings-body footer > span {
  margin-right: auto;
  color: var(--muted);
  font-size: 11px;
}
.trace-content {
  width: min(920px, calc(100% - 64px));
}
.trace-title {
  padding-bottom: 34px;
  border-bottom: 1px solid var(--strong);
}
.trace-title > span {
  color: var(--accent);
  font-size: 12px;
}
.trace-title h2 {
  max-width: 760px;
  margin: 13px 0 18px;
  font:
    500 28px/1.4 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.trace-title > div {
  display: flex;
  gap: 18px;
  color: var(--muted);
  font-size: 12px;
}
.trace-flow {
  margin: 0;
  padding: 18px 0 70px;
  list-style: none;
}
.trace-flow li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 15px;
}
.step-dot {
  position: relative;
  z-index: 1;
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  margin-top: 22px;
  border: 1px solid var(--strong);
  border-radius: 50%;
  background: var(--paper);
  font-size: 11px;
}
.trace-flow li:not(:last-child) > .step-dot:after {
  position: absolute;
  top: 27px;
  bottom: -150px;
  left: 12px;
  width: 1px;
  background: var(--line);
  content: "";
}
.trace-flow li > div {
  padding: 21px 0 28px;
  border-bottom: 1px solid var(--line);
}
.trace-flow header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.trace-flow h3 {
  margin: 0;
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.trace-flow time {
  color: var(--muted);
  font-size: 11px;
}
.trace-flow p {
  margin: 9px 0;
  color: var(--text);
  line-height: 1.6;
}
.trace-flow dl {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 22px;
  margin: 14px 0 0;
}
.trace-flow dl > div {
  display: flex;
  gap: 7px;
}
.trace-flow dt {
  color: var(--muted);
  font:
    11px ui-monospace,
    monospace;
}
.trace-flow dd {
  margin: 0;
  font-size: 11px;
}
.trace-bars {
  display: grid;
  gap: 8px;
  margin-top: 15px;
}
.trace-bars span {
  position: relative;
  padding: 8px 10px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 11px;
}
.trace-bars span:before {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--value);
  background: rgba(91, 91, 247, 0.08);
  content: "";
}
.trace-flow blockquote {
  margin: 15px 0 0;
  padding: 16px 0;
  border-top: 1px solid var(--line);
  font:
    500 16px/1.6 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.drawer-layer {
  position: fixed;
  z-index: 20;
  inset: 0 0 0 264px;
  background: rgba(25, 25, 22, 0.14);
}
.is-collapsed .drawer-layer {
  left: 64px;
}
.drawer {
  display: grid;
  width: min(500px, 92vw);
  height: 100%;
  grid-template-rows: auto auto 1fr;
  margin-left: auto;
  border-left: 1px solid var(--line);
  background: #fff;
}
.drawer-header {
  display: flex;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid var(--line);
}
.drawer-header > div {
  display: grid;
  gap: 5px;
}
.drawer-header span {
  color: var(--muted);
  font-size: 11px;
}
.drawer-header strong {
  font:
    600 17px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.drawer-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid var(--line);
}
.drawer-tabs button {
  position: relative;
  height: 47px;
  color: var(--muted);
  font-size: 12px;
}
.drawer-tabs button.is-active {
  color: var(--ink);
}
.drawer-tabs button.is-active:after {
  position: absolute;
  right: 22%;
  bottom: 0;
  left: 22%;
  height: 2px;
  background: var(--accent);
  content: "";
}
.drawer-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 24px;
}
.source-index {
  display: flex;
  gap: 7px;
  margin-bottom: 24px;
}
.source-index button.is-active {
  border-color: var(--accent);
  background: #f4f3ff;
}
.source-detail > header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}
.source-detail > header div {
  display: grid;
  gap: 4px;
}
.source-detail > header span {
  color: var(--muted);
  font-size: 11px;
}
.source-detail > header em {
  color: #33855a;
  font-size: 12px;
  font-style: normal;
}
.source-detail blockquote {
  margin: 22px 0;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  font:
    15px/1.8 ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.score-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
}
.score-grid > div {
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
.score-grid > div:nth-child(even) {
  padding-left: 18px;
  border-left: 1px solid var(--line);
}
.score-grid dt,
.query-detail dt {
  color: var(--muted);
  font:
    10px ui-monospace,
    monospace;
}
.score-grid dd {
  margin: 6px 0 0;
  font-size: 12px;
}
.query-detail h3 {
  margin: 0 0 14px;
  font:
    600 16px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.query-detail h3:not(:first-child) {
  margin-top: 30px;
}
.query-detail > dl {
  margin: 0;
}
.query-detail > dl > div {
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.query-detail dd {
  margin: 7px 0 0;
  line-height: 1.6;
}
.run-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}
.run-steps li {
  display: grid;
  grid-template-columns: 15px 1fr auto;
  gap: 11px;
  padding: 17px 0;
  border-bottom: 1px solid var(--line);
}
.run-steps i {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.run-steps span {
  display: grid;
  gap: 4px;
}
.run-steps small,
.run-steps time {
  color: var(--muted);
  font-size: 11px;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: background 0.22s;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  background: transparent;
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}
.disclosure-enter-active,
.disclosure-leave-active {
  transition:
    opacity 0.18s,
    transform 0.18s;
}
.disclosure-enter-from,
.disclosure-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.brand-lockup {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.brand-lockup img {
  width: 28px !important;
  height: 28px !important;
  object-fit: contain !important;
}
.brand-lockup strong {
  display: flex;
  align-items: baseline;
  font-size: 20px;
  line-height: 1;
  letter-spacing: -0.02em;
}
.brand-lockup em {
  color: #38bdf8;
  font-style: normal;
}
.is-collapsed .brand-lockup strong {
  display: none;
}
.is-collapsed .brand-lockup img {
  width: 30px !important;
  height: 30px !important;
}
@keyframes mark-pulse {
  50% {
    transform: translateY(-2px);
    box-shadow: 0 0 0 5px rgba(91, 91, 247, 0.08);
  }
}
@keyframes presence {
  0%,
  100% {
    transform: scale(0.84) rotate(-8deg);
    opacity: 0.5;
    filter: blur(4px);
  }
  50% {
    transform: scale(1.08) rotate(9deg);
    opacity: 1;
    filter: blur(1px);
  }
}
@media (max-width: 800px) {
  .studio {
    grid-template-columns: 64px minmax(0, 1fr);
  }
  .sidebar .brand {
    min-height: 108px;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 10px 0;
  }
  .sidebar .brand img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    object-position: left;
  }
  .sidebar .brand button {
    display: none;
  }
  .sidebar .main-nav {
    justify-items: center;
    padding-inline: 0;
  }
  .sidebar .main-nav button {
    width: 40px;
    justify-content: center;
    padding: 0;
  }
  .sidebar .main-nav span,
  .sidebar .history-list,
  .sidebar .new-chat,
  .sidebar .sidebar-search,
  .sidebar .section-context,
  .sidebar .sidebar-footer button span {
    display: none;
  }
  .sidebar .sidebar-footer {
    flex-direction: column;
    justify-content: center;
    padding: 8px 0;
  }
  .message-column,
  .composer,
  .knowledge-content,
  .trace-content {
    width: calc(100% - 28px);
  }
  .metrics {
    grid-template-columns: 1fr 1fr;
  }
  .metrics button:nth-child(3) {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .metrics button:nth-child(4) {
    border-top: 1px solid var(--line);
  }
  .intro-line,
  .settings-body {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .knowledge-list article {
    grid-template-columns: 1fr auto;
  }
  .knowledge-list article dl {
    display: none;
  }
  .drawer-layer {
    left: 64px;
  }
  .drawer {
    width: 100%;
  }
  .run-summary {
    align-items: flex-start;
    flex-direction: column;
  }
  .page-header {
    padding-inline: 15px;
  }
  .model-button {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .studio,
  .drawer-layer,
  .drawer,
  .settings-heading > svg,
  .disclosure-enter-active,
  .disclosure-leave-active {
    transition: none !important;
  }
  .assistant-mark.is-thinking,
  .thinking-presence i {
    animation: none !important;
  }
  .thinking-presence i {
    opacity: 0.85;
    filter: none;
  }
}
button:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid rgba(91, 91, 247, 0.45);
  outline-offset: 2px;
}
.thinking-presence {
  min-height: 72px;
  gap: 0;
  overflow: visible;
}
.thinking-presence > div {
  gap: 3px;
}
.drawer-result-count {
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 11px;
}
.source-index {
  flex-wrap: wrap;
}
</style>
