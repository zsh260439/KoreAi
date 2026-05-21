export const TRACE_PAGE_SIZE = 10

export type TraceBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

export function normalizeTraceStatus(status?: string | null) {
  return String(status || '').trim().toLowerCase()
}

export function statusLabel(status?: string | null) {
  const normalized = normalizeTraceStatus(status)
  if (!normalized) return 'UNKNOWN'
  if (normalized === 'success') return 'SUCCESS'
  if (normalized === 'failed') return 'FAILED'
  if (normalized === 'running') return 'RUNNING'
  if (normalized === 'timeout') return 'TIMEOUT'
  return normalized.toUpperCase()
}

export function statusBadgeVariant(status?: string | null): TraceBadgeVariant {
  const normalized = normalizeTraceStatus(status)
  if (normalized === 'failed' || normalized === 'timeout') return 'destructive'
  if (normalized === 'running') return 'secondary'
  if (normalized === 'success') return 'default'
  return 'outline'
}

export function toTimestamp(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const parsedByDate = new Date(value).getTime()
  if (!Number.isNaN(parsedByDate)) return parsedByDate
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) return null
  return asNumber
}

export function formatDateTime(value?: string | number | null) {
  const timestamp = toTimestamp(value)
  if (timestamp === null) return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

export function formatDuration(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  if (value < 1000) return `${Math.round(value)}ms`
  if (value < 60000) return `${(value / 1000).toFixed(2)}s`
  const minute = Math.floor(value / 60000)
  const second = ((value % 60000) / 1000).toFixed(1)
  return `${minute}m ${second}s`
}

export function percentile(values: number[], rate: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * rate) - 1))
  return sorted[index] ?? 0
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function formatTraceDurationMetric(durationMs: number) {
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0
  if (duration < 1000) {
    return { value: `${Math.round(duration)}`, unit: 'ms' }
  }
  if (duration < 60000) {
    return { value: (duration / 1000).toFixed(2), unit: 's' }
  }
  return { value: (duration / 1000).toFixed(1), unit: 's' }
}
