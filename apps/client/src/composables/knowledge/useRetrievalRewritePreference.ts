import { ref } from 'vue'

const STORAGE_KEY = 'koreai.retrieval.rewrite-enabled'

const rewriteEnabled = ref(true)

let initialized = false

function loadStoredPreference(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  return rawValue !== 'false'
}

function persistPreference(value: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, String(value))
}

export function useRetrievalRewritePreference() {
  if (!initialized) {
    rewriteEnabled.value = loadStoredPreference()
    initialized = true
  }

  const setRewriteEnabled = (value: boolean) => {
    rewriteEnabled.value = value
    persistPreference(value)
  }

  const toggleRewriteEnabled = () => {
    setRewriteEnabled(!rewriteEnabled.value)
  }

  return {
    rewriteEnabled,
    setRewriteEnabled,
    toggleRewriteEnabled
  }
}
