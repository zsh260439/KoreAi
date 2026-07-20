<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { WorkspaceConversationSummary } from "share-type";
import ConversationListItem from "./ConversationListItem.vue";

const props = defineProps<{
  conversations: WorkspaceConversationSummary[];
  activeConversationId?: string;
  loading?: boolean;
  hasMore?: boolean;
  getConversationTimeLabel: (value: string) => string;
  isConversationStreaming: (conversationId: string) => boolean;
}>();

const emit = defineEmits<{
  select: [conversationId: string];
  delete: [conversationId: string];
  loadMorePage: [];
}>();
const activeButtonId = ref<string | null>(null);
const groupedConversations = computed(() => {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterday = today - 86_400_000;
  const groups = [
    { label: "今天", items: [] as WorkspaceConversationSummary[] },
    { label: "昨天", items: [] as WorkspaceConversationSummary[] },
    { label: "更早", items: [] as WorkspaceConversationSummary[] },
  ];

  for (const conversation of props.conversations) {
    const updatedAt = new Date(conversation.updatedAt).getTime();
    const group =
      updatedAt >= today
        ? groups[0]
        : updatedAt >= yesterday
          ? groups[1]
          : groups[2];
    group?.items.push(conversation);
  }

  return groups.filter((group) => group.items.length);
});

const toggleActiveButton = (id: string | null) => {
  activeButtonId.value = id === activeButtonId.value ? null : id;
};
const loadRef = ref<HTMLElement | null>(null);
let observer : IntersectionObserver | null = null;

watch(loadRef, (element) => {
  if (element) {
    observer?.observe(element);
  }
});
onMounted(async ()=>{
    observer = new IntersectionObserver(([entry])=>{
       if(entry.isIntersecting){
        //出现视口传出加载更多事件
        emit('loadMorePage');
       }
    })
})
onBeforeUnmount(()=>{
    if(observer){
      observer.disconnect();
    }
})
</script>

<template>
  <div class="conversation-list">
    <template v-if="loading">
      <div v-for="item in 5" :key="item" class="conversation-list__skeleton" />
    </template>
    <template v-else-if="conversations.length">
      <section v-for="group in groupedConversations" :key="group.label">
        <h2>{{ group.label }}</h2>
        <ConversationListItem
          v-for="conversation in group.items"
          :key="conversation.id"
          :conversation="conversation"
          :activeButtonId="activeButtonId"
          :active="conversation.id === activeConversationId"
          @toggleActiveButton="toggleActiveButton"
          :streaming="isConversationStreaming(conversation.id)"
          :time-label="getConversationTimeLabel(conversation.updatedAt)"
          @delete="emit('delete', $event)"
          @select="emit('select', $event)"
        />
      </section>
       <div v-if="hasMore && !loading" ref="loadRef"> 加载更多</div>
    </template>
    <p v-else class="conversation-list__empty">暂无会话</p>
  </div>
</template>

<style scoped>
.conversation-list {
  display: grid;
  gap: 16px;
  padding: 0 4px 16px;
}
.conversation-list section {
  display: grid;
  gap: 2px;
}
.conversation-list h2 {
  margin: 0 0 5px;
  padding: 0 7px;
  color: #8a8a83;
  font-size: 11px;
  font-weight: 500;
}
.conversation-list__skeleton {
  height: 35px;
  border-radius: 7px;
  background: linear-gradient(90deg, #efefea 25%, #f7f7f4 50%, #efefea 75%);
  background-size: 200% 100%;
  animation: sidebar-loading 1.4s infinite;
}
.conversation-list__empty {
  margin: 8px 7px;
  color: #9a9a93;
  font-size: 12px;
}
@keyframes sidebar-loading {
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation-list__skeleton {
    animation: none;
  }
}
</style>
