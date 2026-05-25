import { nextTick, ref } from 'vue'

export const useAutoScroll = (threshold = 32) => {
  const scrollRef = ref<HTMLDivElement>()
  const shouldStickToBottom = ref(true)

  const updateShouldStickToBottom = () => {
    const container = scrollRef.value
    if (!container) {
      shouldStickToBottom.value = true
      return
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldStickToBottom.value = distanceToBottom <= threshold
  }

  const scrollToBottom = async (force = false) => {
    await nextTick()

    const container = scrollRef.value
    if (!container) {
      return
    }

    if (!force && !shouldStickToBottom.value) {
      return
    }

    container.scrollTop = container.scrollHeight
    shouldStickToBottom.value = true
  }

  return {
    scrollRef,
    shouldStickToBottom,
    updateShouldStickToBottom,
    scrollToBottom
  }
}
