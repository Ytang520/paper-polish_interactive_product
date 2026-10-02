import type { StreamRequestParams } from '../types'

export function createRequestId(): string {
  return `req_${crypto.randomUUID()}`
}

/** Collect only this request's events, including events received before IPC resolves. */
export function collectStream(
  params: StreamRequestParams,
  signal?: AbortSignal,
  api = window.api
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = params._requestId || createRequestId()
    let content = ''
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      unsubscribe()
      signal?.removeEventListener('abort', cancel)
      callback()
    }
    const cancel = () => {
      void api.abortStream(requestId).catch(() => {})
      finish(() => reject(new DOMException('Request cancelled', 'AbortError')))
    }
    const unsubscribe = api.onStreamChunk((id, chunk) => {
      if (id !== requestId || settled) return
      if (chunk.type === 'content') content += chunk.content
      if (chunk.type === 'done') finish(() => resolve(content))
      if (chunk.type === 'error') finish(() => reject(new Error(chunk.message)))
    })
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) {
      cancel()
      return
    }
    void api.startStream({ ...params, _requestId: requestId }).then(() => {
      // Cancellation may have happened while the main process prepared the provider.
      if (signal?.aborted) return api.abortStream(requestId)
    }).catch(error => finish(() => reject(error)))
  })
}
