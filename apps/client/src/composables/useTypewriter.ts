import {
  computed,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter
} from 'vue'

type UseTypewriterOptions = {
  enabled?: MaybeRefOrGetter<boolean>
  intervalMs?: MaybeRefOrGetter<number | undefined>
  step?: MaybeRefOrGetter<number | undefined>
}

export const useTypewriter = (
  source: MaybeRefOrGetter<string>,
  options: UseTypewriterOptions = {}
) => {
  const displayed = ref('')
  const enabled = computed(() => Boolean(toValue(options.enabled) ?? false))
  const intervalMs = computed(() => Math.max(8, Number(toValue(options.intervalMs) ?? 16)))
  const step = computed(() => Math.max(1, Number(toValue(options.step) ?? 2)))

  let timer: number | null = null

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  const resolveSource = () => String(toValue(source) ?? '')

  const sync = () => {
    const target = resolveSource()

    if (!enabled.value) {
      displayed.value = target
      stop()
      return
    }

    if (displayed.value.length >= target.length) {
      displayed.value = target
      stop()
      return
    }

    if (timer !== null) {
      return
    }

    timer = window.setInterval(() => {
      const nextTarget = resolveSource()

      if (displayed.value.length >= nextTarget.length) {
        displayed.value = nextTarget
        stop()
        return
      }

      displayed.value = nextTarget.slice(0, displayed.value.length + step.value)
    }, intervalMs.value)
  }

  watch([() => resolveSource(), enabled], sync, { immediate: true })

  onBeforeUnmount(() => {
    stop()
  })

  return displayed
}
