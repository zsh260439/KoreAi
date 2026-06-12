import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

export const useAutoScroll = (threshold = 32) => {
  const messagesRef = ref<HTMLDivElement>()
  const stickToBottom = ref(true)
  let observer: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null

  //声明销毁滚动区域变更监听
  const stopObserveContainer = () => {
    observer?.disconnect()
    observer = null
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  //声明直接同步到底部滚动位置
  const syncMessagesToBottom = () => {
    const container = messagesRef.value
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }

  //声明监听滚动容器内部异步高度变化
  const observeContainer = (container?: HTMLDivElement) => {
    stopObserveContainer()

    if (!container) {
      return
    }

    //声明统一处理异步渲染后的跟底动作
    const syncFollowPosition = () => {
      if (!stickToBottom.value) {
        return
      }

      requestAnimationFrame(() => {
        if (stickToBottom.value) {
          syncMessagesToBottom()
        }
      })
    }

    observer = new MutationObserver(() => {
      syncFollowPosition()
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    })

    //声明监听消息内容真实高度变化
    const contentElement = container.firstElementChild
    if (contentElement) {
      resizeObserver = new ResizeObserver(() => {
        syncFollowPosition()
      })
      resizeObserver.observe(contentElement)
    }
  }

  //声明更新是否保持底部吸附
  const updateStickToBottom = () => {
    const container = messagesRef.value
    if (!container) {
      stickToBottom.value = true
      return
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    stickToBottom.value = distanceToBottom <= threshold
  }

  //声明滚动消息区域到底部
  const scrollMessagesToBottom = async (force = false) => {
    await nextTick()

    const container = messagesRef.value
    if (!container) {
      return
    }
    // 如果当前滚动位置在底部，且不强制滚动，直接返回
    if (!force && !stickToBottom.value) {
      return
    }
    //声明滚动到最底部
    syncMessagesToBottom()
    stickToBottom.value = true
  }

  watch(messagesRef, (container) => {
    observeContainer(container)
  })

  onBeforeUnmount(() => {
    stopObserveContainer()
  })

  return {
    messagesRef,
    stickToBottom,
    updateStickToBottom,
    scrollMessagesToBottom
  }
}
