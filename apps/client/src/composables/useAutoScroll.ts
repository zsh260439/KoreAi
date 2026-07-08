import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const FORCE_STICK_SETTLE_MS = 100

export const useAutoScroll = (threshold = 32) => {
  const messagesRef = ref<HTMLDivElement>()
  const stickToBottom = ref(true)
  const forceStickToBottom = ref(false)

  let observer: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let settleTimer: number | null = null

  const stopObserveContainer = () => {
    observer?.disconnect()
    observer = null
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  const stopSettleTimer = () => {
    if (settleTimer !== null) {
      window.clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  // 聊天首屏和流式跟底都应该瞬时贴底，不做平滑滚动。
  const syncMessagesToBottom = () => {
    const container = messagesRef.value
    if (!container) {
      return
    }

    container.scrollTop = container.scrollHeight
  }

  const scheduleForceStickRelease = () => {
    if (!forceStickToBottom.value) {
      return
    }

    stopSettleTimer()
    settleTimer = window.setTimeout(() => {
      forceStickToBottom.value = false
      settleTimer = null
      updateStickToBottom()
    }, FORCE_STICK_SETTLE_MS)
  }

  const syncFollowPosition = () => {
    if (!stickToBottom.value && !forceStickToBottom.value) {
      return
    }

    requestAnimationFrame(() => {
      if (!stickToBottom.value && !forceStickToBottom.value) {
        return
      }

      syncMessagesToBottom()
      scheduleForceStickRelease()
    })
  }

  const observeContainer = (container?: HTMLDivElement) => {
    stopObserveContainer()

    if (!container) {
      return
    }

    observer = new MutationObserver(() => {
      syncFollowPosition()
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    })

    resizeObserver = new ResizeObserver(() => {
      syncFollowPosition()
    })

    resizeObserver.observe(container)

    const contentElement = container.firstElementChild
    if (contentElement) {
      resizeObserver.observe(contentElement)
    }
  }

  const updateStickToBottom = () => {
    const container = messagesRef.value
    if (!container) {
      stickToBottom.value = true
      return
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    const nextStickToBottom = distanceToBottom <= threshold

    stickToBottom.value = nextStickToBottom

    if (!nextStickToBottom && forceStickToBottom.value) {
      forceStickToBottom.value = false
      stopSettleTimer()
    }
  }

  const scrollMessagesToBottom = async (force = false) => {
    await nextTick()

    const container = messagesRef.value
    if (!container) {
      return
    }

    if (!force && !stickToBottom.value && !forceStickToBottom.value) {
      return
    }

    syncMessagesToBottom()
    stickToBottom.value = true
  }

  const startForceStickToBottom = () => {
    forceStickToBottom.value = true
    stickToBottom.value = true
    scheduleForceStickRelease()
  }

  const stopForceStickToBottom = () => {
    forceStickToBottom.value = false
    stopSettleTimer()
  }

  watch(messagesRef, (container) => {
    observeContainer(container)
  })

  onBeforeUnmount(() => {
    stopObserveContainer()
    stopSettleTimer()
  })

  return {
    messagesRef,
    stickToBottom,
    forceStickToBottom,
    startForceStickToBottom,
    stopForceStickToBottom,
    updateStickToBottom,
    scrollMessagesToBottom
  }
}
