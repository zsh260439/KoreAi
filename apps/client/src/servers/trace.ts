import { cloneMock, traceDetails, wait } from '@/utils'

export const fetchTraceDetail = async (traceId: string) => {
  await wait(220)
  return cloneMock(traceDetails[traceId] ?? null)
}
