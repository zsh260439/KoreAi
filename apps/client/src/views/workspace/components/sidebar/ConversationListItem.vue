<script setup lang="ts">
import { MoreHorizontal, Trash2 } from "lucide-vue-next";
import { onMounted, onUnmounted, ref } from "vue";
import type { WorkspaceConversationSummary } from "share-type";
import { computed } from "vue";
const props = defineProps<{
  conversation: WorkspaceConversationSummary;
  active?: boolean;
  streaming?: boolean;
  timeLabel: string;
  activeButtonId?: string | null;
}>();

const emit = defineEmits<{
  select: [conversationId: string];
  delete: [conversationId: string];
  toggleActiveButton: [id: string | null];
}>();

const menuOpen = computed(() => props.activeButtonId === props.conversation.id);
const actionsRef = ref<HTMLDivElement | null>(null);

const handleDocumentClick = (event: MouseEvent) => {
  if (!actionsRef.value?.contains(event.target as Node)) {
    emit("toggleActiveButton", null);
  }
};

const handleDelete = (conversationId: string) => {
  emit("delete", conversationId);
};

onMounted(() => document.addEventListener("click", handleDocumentClick));
onUnmounted(() => document.removeEventListener("click", handleDocumentClick));
</script>

<template>
  <div class="conversation-list-item" :class="{ 'is-active': active }">
    <button
      type="button"
      :aria-label="conversation.title"
      class="conversation-list-item__main"
      @click="emit('select', conversation.id)"
    >
      <span class="conversation-list-item__title">{{
        conversation.title
      }}</span>
      <span class="conversation-list-item__time">{{
        streaming ? "生成中" : timeLabel
      }}</span>
    </button>

    <div ref="actionsRef" class="conversation-list-item__actions">
      <button
        type="button"
        class="conversation-list-item__more"
        aria-label="会话操作"
        :aria-expanded="menuOpen"
        @click.stop="emit('toggleActiveButton', conversation.id)"
      >
        <MoreHorizontal class="size-4" />
      </button>
      <div v-if="menuOpen" class="conversation-list-item__menu" role="menu">
        <button
          type="button"
          role="menuitem"
          @click="handleDelete(conversation.id)"
        >
          <Trash2 class="size-3.5" />
          删除会话
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conversation-list-item {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  border-radius: 7px;
  color: #44443f;
}
.conversation-list-item:hover,
.conversation-list-item.is-active {
  background: #efefea;
}
.conversation-list-item.is-active {
  color: #5b5bf7;
}
.conversation-list-item__main {
  display: flex;
  min-width: 0;
  min-height: 36px;
  flex: 1;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.conversation-list-item__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font:
    13px ui-serif,
    Georgia,
    "Songti SC",
    serif;
}
.conversation-list-item__time {
  flex: none;
  color: #8a8a83;
  font-size: 10px;
}
.conversation-list-item__actions {
  position: relative;
  display: flex;
  flex: none;
}
.conversation-list-item__more {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: #f7f7f4;
  color: #777770;
  cursor: pointer;
}
.conversation-list-item:hover .conversation-list-item__time {
  display: none;
}
.conversation-list-item__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  min-width: 112px;
  padding: 4px;
  border: 1px solid #deded7;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 5px 8px rgba(25, 25, 24, 0.1);
}
.conversation-list-item__menu button {
  display: flex;
  width: 100%;
  min-height: 30px;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  padding: 0 8px;
  color: #aa3f3f;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.conversation-list-item__menu button:hover {
  background: #fff4f2;
}
</style>
