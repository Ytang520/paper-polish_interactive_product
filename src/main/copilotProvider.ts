import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ModuleConfig } from '../renderer/src/types'

const COPILOT_PORT = 8070
const COPILOT_BASE_URL = `http://localhost:${COPILOT_PORT}/v1`
const COPILOT_TOKEN_PATH = path.join(os.homedir(), '.local', 'share', 'copilot-api', 'github_token')

export type CopilotProviderStatus = {
  state: 'idle' | 'connected' | 'started' | 'error'
  message: string
  connected: boolean
}

let currentStatus: CopilotProviderStatus = {
  state: 'idle',
  message: 'GitHub Copilot provider not checked yet / GitHub Copilot provider 尚未检测',
  connected: false
}

let ensurePromise: Promise<CopilotProviderStatus> | null = null

function setStatus(status: CopilotProviderStatus): CopilotProviderStatus {
  currentStatus = status
  return status
}

function ensureLocalNoProxy(): void {
  const required = ['localhost', '127.0.0.1', '::1']
  const existing = (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  const merged = Array.from(new Set([...existing, ...required]))
  process.env.NO_PROXY = merged.join(',')
  process.env.no_proxy = process.env.NO_PROXY
}

async function isServerReady(): Promise<boolean> {
  ensureLocalNoProxy()

  try {
    const response = await fetch(`${COPILOT_BASE_URL}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500)
    })
    return response.ok
  } catch {
    return false
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForServerReady(timeoutMs: number = 30000): Promise<boolean> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady()) {
      return true
    }
    await wait(500)
  }

  return false
}

function getTokenPath(): string {
  return COPILOT_TOKEN_PATH
}

function readCopilotToken(): string {
  const tokenPath = getTokenPath()
  let token: string
  try {
    token = fs.readFileSync(tokenPath, 'utf-8').trim()
  } catch {
    throw new Error('Copilot token is unavailable. Complete local copilot-api authentication first.')
  }
  if (!token) {
    throw new Error('Copilot token file is empty. Complete local copilot-api authentication first.')
  }
  return token
}

function startCopilotServer(): void {
  ensureLocalNoProxy()

  const child = spawn('npx', ['copilot-api@latest', 'start', '--port', String(COPILOT_PORT)], {
    shell: true,
    windowsHide: true,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      NO_PROXY: process.env.NO_PROXY,
      no_proxy: process.env.no_proxy
    }
  })

  child.unref()
}

export function isCopilotProvider(baseUrl: string): boolean {
  return baseUrl.trim().replace(/\/$/, '') === COPILOT_BASE_URL
}

export function getCopilotProviderStatus(): CopilotProviderStatus {
  return currentStatus
}

export async function ensureCopilotProviderReady(): Promise<CopilotProviderStatus> {
  if (ensurePromise) return ensurePromise

  ensurePromise = (async () => {
    try {
      readCopilotToken()

      if (await isServerReady()) {
        return setStatus({
          state: 'connected',
          message: 'GitHub Copilot provider already connected / GitHub Copilot provider 已连接',
          connected: true
        })
      }

      startCopilotServer()
      const ready = await waitForServerReady()
      if (!ready) {
        return setStatus({
          state: 'error',
          message: 'GitHub Copilot provider failed to start on port 8070 / GitHub Copilot provider 未能在 8070 端口启动',
          connected: false
        })
      }

      return setStatus({
        state: 'started',
        message: 'GitHub Copilot provider started and connected / GitHub Copilot provider 已启动并连接',
        connected: true
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error'
      return setStatus({
        state: 'error',
        message: `GitHub Copilot provider unavailable: ${detail} / GitHub Copilot provider 不可用: ${detail}`,
        connected: false
      })
    } finally {
      ensurePromise = null
    }
  })()

  return ensurePromise
}

export async function resolveModuleConfig(config: ModuleConfig): Promise<ModuleConfig> {
  if (!isCopilotProvider(config.base_url)) {
    return config
  }

  const status = await ensureCopilotProviderReady()
  if (!status.connected) {
    throw new Error(status.message)
  }

  return {
    ...config,
    base_url: COPILOT_BASE_URL,
    api_key: readCopilotToken()
  }
}

export { COPILOT_BASE_URL, COPILOT_PORT }
