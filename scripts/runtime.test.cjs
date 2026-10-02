const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const ts = require('typescript')

function loadSource(relative, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relative)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  const localRequire = createRequire(filename)
  new Function('require', 'module', 'exports', output)(id => mocks[id] ?? localRequire(id), module, module.exports)
  return module.exports
}

const llm = loadSource('src/main/llm.ts')
const { collectStream } = loadSource('src/renderer/src/lib/stream.ts')
const params = { messages: [], moduleKey: 'paragraph_refinement' }
const config = { base_url: 'https://example.com/v1/', api_key: '', model_name: 'test-model', temperature: 0.5, max_tokens: 50 }

function responseFromParts(parts) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(new TextEncoder().encode(part))
      controller.close()
    }
  }))
}

test('SSE preserves split chunks, reasoning and final content with one completion', async () => {
  const chunks = []
  const response = responseFromParts([
    'data: {"choices":[{"delta":{"reasoning_content":"why"}}]}\r\n\r\n',
    'data:{"choices":[{"delta":{"content":"hel',
    'lo"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
  ])
  for await (const chunk of llm.parseSSEStream(response)) chunks.push(chunk)
  assert.deepEqual(chunks, [
    { type: 'reasoning', content: 'why' },
    { type: 'content', content: 'hello' },
    { type: 'done', finishReason: 'stop' }
  ])
})

test('SSE processes the last line and completes at EOF without a DONE marker', async () => {
  const chunks = []
  for await (const chunk of llm.parseSSEStream(responseFromParts(['data: {"choices":[{"delta":{"content":"tail"}}]}']))) chunks.push(chunk)
  assert.deepEqual(chunks.map(c => c.type), ['content', 'done'])
  assert.equal(chunks[0].content, 'tail')
})

test('SSE does not expose provider error payloads', async () => {
  const chunks = []
  for await (const chunk of llm.parseSSEStream(responseFromParts(['data: {"error":{"message":"private manuscript fixture"}}\n']))) chunks.push(chunk)
  assert.equal(chunks[0].type, 'error')
  assert.ok(!JSON.stringify(chunks).includes('private manuscript fixture'))
})

test('the caller request ID cancels the actual network stream', async t => {
  let requestedUrl
  t.mock.method(globalThis, 'fetch', (url, options) => {
    requestedUrl = url
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })
    })
  })
  let complete
  const done = new Promise(resolve => { complete = resolve })
  const id = await llm.startStream([], config, complete, 'cancel-fixture')
  assert.equal(id, 'cancel-fixture')
  assert.equal(requestedUrl, 'https://example.com/v1/chat/completions')
  assert.equal(llm.abortStream(id), true)
  assert.deepEqual(await done, { type: 'done', finishReason: 'abort' })
  assert.equal(llm.abortStream(id), false)
})

test('HTTP errors never forward response bodies', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private response fixture', { status: 500 }))
  let receive
  const done = new Promise(resolve => { receive = resolve })
  await llm.startStream([], config, receive)
  const result = await done
  assert.equal(result.type, 'error')
  assert.equal(result.code, 500)
  assert.ok(!result.message.includes('private response fixture'))
})

test('concurrent collectors ignore other streams and accept events before start resolves', async () => {
  const listeners = new Set()
  const pending = []
  const api = {
    onStreamChunk(callback) { listeners.add(callback); return () => listeners.delete(callback) },
    startStream(request) { pending.push(request); return Promise.resolve(request._requestId) },
    abortStream: async () => {}
  }
  const first = collectStream({ ...params, _requestId: 'first' }, undefined, api)
  const second = collectStream({ ...params, _requestId: 'second' }, undefined, api)
  const emit = (id, chunk) => { for (const listener of listeners) listener(id, chunk) }
  emit('unrelated', { type: 'content', content: 'ignored' })
  emit('first', { type: 'content', content: 'A' })
  emit('second', { type: 'content', content: 'B' })
  emit('second', { type: 'done' })
  emit('first', { type: 'done' })
  assert.deepEqual(await Promise.all([first, second]), ['A', 'B'])
  assert.equal(listeners.size, 0)
  assert.equal(pending.length, 2)
})

test('collector cancellation releases listeners and aborts again after delayed startup', async () => {
  const controller = new AbortController()
  let listenerCount = 0
  let finishStart
  const aborted = []
  const api = {
    onStreamChunk() { listenerCount++; return () => listenerCount-- },
    startStream: () => new Promise(resolve => { finishStart = resolve }),
    abortStream: async id => { aborted.push(id) }
  }
  const promise = collectStream({ ...params, _requestId: 'delayed' }, controller.signal, api)
  controller.abort()
  await assert.rejects(promise, { name: 'AbortError' })
  finishStart('delayed')
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(aborted, ['delayed', 'delayed'])
  assert.equal(listenerCount, 0)
})

test('preload forwards one consistent request ID without mutating input', async () => {
  let api
  let sent
  loadSource('src/preload/index.ts', { electron: {
    contextBridge: { exposeInMainWorld(_name, value) { api = value } },
    ipcRenderer: { async invoke(channel, request) { sent = { channel, request }; return request._requestId } }
  } })
  const request = { ...params, _requestId: 'renderer-id' }
  assert.equal(await api.startStream(request), 'renderer-id')
  assert.equal(sent.request._requestId, 'renderer-id')
  const withoutId = { ...params }
  assert.ok(await api.startStream(withoutId))
  assert.equal(withoutId._requestId, undefined)
})

test('loading settings returns independent defaults and ignores prototype keys', () => {
  const parent = path.resolve(__dirname, '..', '.validation')
  fs.mkdirSync(parent, { recursive: true })
  const scratch = fs.mkdtempSync(path.join(parent, 'settings-test-'))
  try {
    const settings = loadSource('src/main/settings.ts', { electron: { app: { getPath: () => scratch } } })
    const defaults = { modules: { sample: { model_name: 'original' } } }
    const first = settings.loadSettings(defaults)
    first.modules.sample.model_name = 'changed'
    assert.equal(settings.loadSettings(defaults).modules.sample.model_name, 'original')
    fs.writeFileSync(path.join(scratch, 'config.json'), '{"modules":{"sample":{"temperature":0.3}},"__proto__":{"polluted":true}}')
    const loaded = settings.loadSettings(defaults)
    assert.equal(loaded.modules.sample.model_name, 'original')
    assert.equal(loaded.modules.sample.temperature, 0.3)
    assert.equal(loaded.polluted, undefined)
    loaded.modules.sample.model_name = 'another'
    assert.equal(defaults.modules.sample.model_name, 'original')
  } finally {
    if (!path.resolve(scratch).startsWith(parent + path.sep)) throw new Error('Unsafe test cleanup path')
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})
