<script setup lang="ts">
import {
  ArrowUpRight,
  BookOpenText,
  Database,
  SearchCheck,
  Sparkles,
} from "lucide-vue-next";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    knowledgeBases?: Array<{ documentCount: number; name: string }>;
  }>(),
  { knowledgeBases: () => [] },
);
const emit = defineEmits<{ prompt: [value: string] }>();

const documentCount = computed(() =>
  props.knowledgeBases.reduce((total, base) => total + base.documentCount, 0),
);
const examples = [
  "ENERGY-03 的核心阈值和责任角色是什么？",
  "DOCX-QLT-01 的主控制阈值以及预警值是什么？",
  "事故复盘 INC-011-2 的验收目标是什么？",
];
</script>

<template>
  <section class="workspace-welcome">
    <div class="workspace-welcome__halo" aria-hidden="true">
      <i /><i /><i />
    </div>
    <p class="workspace-welcome__eyebrow">KoreAI 知识工作台</p>
    <h2>让 <span>RAG</span> 从资料中找到可追溯的回答。</h2>
    <p class="workspace-welcome__intro">
      从本地资料开始检索，回答会保留实际命中的证据片段、分数与运行过程。
    </p>

    <dl class="workspace-welcome__stats">
      <div>
        <dt><Database :size="16" /> 知识库</dt>
        <dd>{{ knowledgeBases.length }}</dd>
      </div>
      <div>
        <dt><BookOpenText :size="16" /> 已入库文档</dt>
        <dd>{{ documentCount }}</dd>
      </div>
      <div>
        <dt><SearchCheck :size="16" /> 召回方式</dt>
        <dd>混合检索</dd>
      </div>
    </dl>

    <section class="workspace-welcome__examples">
      <header>
        <div>
          <Sparkles :size="16" />
          <span>从一个问题开始</span>
        </div>
        <small>示例检索</small>
      </header>
      <button
        v-for="example in examples"
        :key="example"
        type="button"
        @click="emit('prompt', example)"
      >
        <span>{{ example }}</span>
        <ArrowUpRight :size="16" />
      </button>
    </section>

    <div class="workspace-welcome__flow" aria-label="RAG 工作流程">
      <span>问题</span><i /><span>检索</span><i /><span>证据</span><i /><span>回答</span>
    </div>
  </section>
</template>

<style scoped>
.workspace-welcome {
  position: relative;
  isolation: isolate;
  padding: clamp(52px, 10vh, 112px) 0 48px;
}
.workspace-welcome::before {
  position: absolute;
  z-index: -2;
  top: -108px;
  right: -230px;
  width: 600px;
  height: 440px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(110, 103, 255, 0.14),
    rgba(132, 126, 255, 0.045) 42%,
    transparent 72%
  );
  content: "";
}
.workspace-welcome::after {
  position: absolute;
  z-index: -1;
  top: 24px;
  left: -260px;
  width: 520px;
  height: 330px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(133, 132, 255, 0.075),
    transparent 70%
  );
  content: "";
}
.workspace-welcome__halo {
  position: absolute;
  z-index: -1;
  top: 12px;
  right: -28px;
  width: 230px;
  height: 170px;
  opacity: 0.65;
  pointer-events: none;
}
.workspace-welcome__halo i {
  position: absolute;
  border: 1px solid rgba(91, 91, 247, 0.2);
  border-radius: 50%;
}
.workspace-welcome__halo i:nth-child(1) {
  top: 10px;
  right: 18px;
  width: 140px;
  height: 140px;
}
.workspace-welcome__halo i:nth-child(2) {
  top: 50px;
  right: 94px;
  width: 84px;
  height: 84px;
}
.workspace-welcome__halo i:nth-child(3) {
  top: 22px;
  right: 8px;
  width: 9px;
  height: 9px;
  border: 0;
  background: #7171ee;
}
.workspace-welcome__halo i:nth-child(3)::after {
  position: absolute;
  top: 62px;
  left: -74px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #b0adff;
  content: "";
}
.workspace-welcome__eyebrow,
.workspace-welcome__examples small,
.workspace-welcome__flow {
  color: #777770;
  font-size: 12px;
  letter-spacing: 0.03em;
}
.workspace-welcome__eyebrow {
  margin: 0 0 17px;
  color: #5653ba;
  font-weight: 600;
}
.workspace-welcome h2 {
  max-width: 690px;
  margin: 0;
  text-wrap: balance;
  font: 600 clamp(32px, 4.6vw, 50px) / 1.16 ui-serif, Georgia, "Songti SC", serif;
  letter-spacing: -0.03em;
}
.workspace-welcome h2 span {
  color: #5b5bf7;
}
.workspace-welcome__intro {
  max-width: 610px;
  margin: 21px 0 0;
  color: #555550;
  font: 16px / 1.75 ui-serif, Georgia, "Songti SC", serif;
}
.workspace-welcome__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  max-width: 690px;
  margin: 47px 0 0;
  border-top: 1px solid #e2e2dc;
  border-bottom: 1px solid #e2e2dc;
}
.workspace-welcome__stats div {
  min-height: 102px;
  padding: 18px 17px;
  border-left: 1px solid #e8e8e2;
}
.workspace-welcome__stats div:first-child {
  border-left: 0;
}
.workspace-welcome__stats dt {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #777770;
  font-size: 12px;
}
.workspace-welcome__stats dd {
  margin: 13px 0 0;
  color: #242421;
  font: 600 26px ui-serif, Georgia, "Songti SC", serif;
}
.workspace-welcome__stats div:last-child dd {
  font-size: 18px;
}
.workspace-welcome__examples {
  max-width: 690px;
  margin-top: 47px;
}
.workspace-welcome__examples header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  color: #2f2f2b;
  font: 600 16px ui-serif, Georgia, "Songti SC", serif;
}
.workspace-welcome__examples header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.workspace-welcome__examples header svg {
  color: #5b5bf7;
}
.workspace-welcome__examples button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 3px;
  border: 0;
  border-top: 1px solid #e8e8e2;
  background: transparent;
  color: #2f2f2a;
  text-align: left;
  font: 15px / 1.5 ui-serif, Georgia, "Songti SC", serif;
  cursor: pointer;
}
.workspace-welcome__examples button:last-child {
  border-bottom: 1px solid #e8e8e2;
}
.workspace-welcome__examples button:hover {
  color: #5b5bf7;
}
.workspace-welcome__examples button svg {
  flex: none;
  color: #8c8c84;
  transition: transform 180ms ease-out, color 180ms ease-out;
}
.workspace-welcome__examples button:hover svg {
  color: #5b5bf7;
  transform: translate(2px, -2px);
}
.workspace-welcome__flow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 31px 0 0;
  color: #6a6963;
  font-weight: 500;
}
.workspace-welcome__flow i {
  width: 20px;
  height: 1px;
  background: #c9c8ee;
}
@media (max-width: 620px) {
  .workspace-welcome__stats {
    grid-template-columns: 1fr;
  }
  .workspace-welcome__stats div {
    min-height: 68px;
    border-top: 1px solid #e8e8e2;
    border-left: 0;
  }
  .workspace-welcome__stats div:first-child {
    border-top: 0;
  }
  .workspace-welcome__stats dd {
    margin-top: 7px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-welcome__examples button svg {
    transition: none;
  }
}
</style>
