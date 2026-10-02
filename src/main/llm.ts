/**
 * LLM Streaming Bridge — handles OpenAI-compatible streaming API calls
 * Runs in Electron main process
 */

import type { ModuleConfig, StreamChunk, ChatMessage } from '../renderer/src/types'

interface ActiveStream {
  controller: AbortController
}

const activeStreams = new Map<string, ActiveStream>()

let streamIdCounter = 0

function generateStreamId(): string {
  return `stream_${Date.now()}_${++streamIdCounter}`
}

/**
 * Parse SSE stream from OpenAI-compatible API
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()

        if (!trimmed || trimmed.startsWith(':')) continue

        if (/^data:\s*\[DONE\]$/.test(trimmed)) {
          yield { type: 'done', finishReason: 'stop' }
          return
        }

        if (trimmed.startsWith('data:')) {
          let chunk
          try {
            chunk = JSON.parse(trimmed.slice(5).trim())
          } catch {
            continue
          }
          if (chunk.error) {
            yield { type: 'error', message: 'The provider reported a streaming error / 模型服务返回流式错误' }
            return
          }
          const delta = chunk.choices?.[0]?.delta
          const reasoningContent = delta?.reasoning_content ?? delta?.reasoning
          if (typeof reasoningContent === 'string' && reasoningContent) {
            yield { type: 'reasoning', content: reasoningContent }
          }
          if (typeof delta?.content === 'string' && delta.content) {
            yield { type: 'content', content: delta.content }
          }
          if (chunk.choices?.[0]?.finish_reason) {
            yield { type: 'done', finishReason: chunk.choices[0].finish_reason }
            return
          }
        }
      }
      if (done) {
        yield { type: 'done', finishReason: 'stop' }
        return
      }
    }
  } finally {
    try { await reader.cancel() } finally { reader.releaseLock() }
  }
}

/**
 * Start a streaming LLM request
 */
export async function startStream(
  messages: ChatMessage[],
  config: ModuleConfig,
  onChunk: (chunk: StreamChunk) => void,
  requestId: string = generateStreamId()
): Promise<string> {
  if (activeStreams.has(requestId)) throw new Error('A request with this ID is already running')
  const controller = new AbortController()

  activeStreams.set(requestId, { controller })

  // Run the stream in background
  ;(async () => {
    try {
      // Build request body
      const body: Record<string, unknown> = {
        model: config.model_name,
        messages: messages.map(m => {
          const msg: Record<string, unknown> = { role: m.role, content: m.content }
          if (m.reasoning_content) {
            msg.reasoning_content = m.reasoning_content
          }
          return msg
        }),
        stream: true,
        temperature: config.temperature,
        max_tokens: config.max_tokens
      }

      // Handle thinking mode for Volcengine/Doubao models
      const isVolcengine = config.base_url.includes('volces.com') || config.base_url.includes('volcengine')
      if (config.reasoning_mode) {
        delete body.temperature
        if (isVolcengine) {
          body.thinking = { type: 'enabled' }
        }
      } else if (isVolcengine) {
        body.thinking = { type: 'disabled' }
      }

      const response = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.api_key}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        // Provider error bodies may echo credentials or submitted manuscript text.
        await response.body?.cancel()
        let errorMessage: string

        switch (response.status) {
          case 401:
            errorMessage = 'Invalid API key / API 密钥无效'
            break
          case 429:
            errorMessage = 'Rate limit exceeded. Please wait / 请求过于频繁，请稍后重试'
            break
          case 404:
            errorMessage = 'Model or endpoint not found / 模型或服务地址未找到'
            break
          default:
            errorMessage = `API Error ${response.status} / 模型服务请求失败，请检查服务配置`
        }

        onChunk({ type: 'error', message: errorMessage, code: response.status })
        return
      }

      for await (const chunk of parseSSEStream(response)) {
        if (controller.signal.aborted) {
          onChunk({ type: 'done', finishReason: 'abort' })
          return
        }
        onChunk(chunk)
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        onChunk({ type: 'done', finishReason: 'abort' })
        return
      }

      onChunk({ type: 'error', message: 'Unable to complete the API request / 无法完成请求，请检查网络和服务配置' })
    } finally {
      activeStreams.delete(requestId)
    }
  })()

  return requestId
}

/**
 * Abort an active stream
 */
export function abortStream(requestId: string): boolean {
  const stream = activeStreams.get(requestId)
  if (stream) {
    stream.controller.abort()
    activeStreams.delete(requestId)
    return true
  }
  return false
}
