/**
 * Electron Main Process Entry
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { startStream, abortStream } from './llm'
import { ensureCopilotProviderReady, getCopilotProviderStatus, resolveModuleConfig, isCopilotProvider } from './copilotProvider'
import {
  getInMemorySettings,
  setInMemorySettings,
  persistSettings,
  getSettingsPath,
  loadSettings,
  saveSettings,
  initTempSettings,
  cleanupTempSettings
} from './settings'
import {
  initDatabase,
  closeDatabase,
  getDocuments,
  createDocument,
  deleteDocument,
  getTerminology,
  addTerm,
  updateTerm,
  deleteTerm,
  searchTerms,
  getReferenceArticles,
  addReferenceArticle,
  updateReferenceArticle,
  deleteReferenceArticle,
  getArticleEmbeddings,
  getProTerminology,
  addProTerm,
  updateProTerm,
  deleteProTerm,
  searchProTerms,
  getFolderTerminology,
  addFolderTerm,
  updateFolderTerm,
  deleteFolderTerm,
  searchFolderTerms,
  getPolishSessions,
  getPolishSession,
  savePolishSession,
  deletePolishSession,
  getAllFolders,
  saveAllFolders
} from './database'
import { embedArticle, searchSimilarChunks } from './embeddings'
import crypto from 'node:crypto'

// Default settings imported from shared types (duplicated here to avoid cross-compilation issues)
const DEFAULT_MODULE_CONFIG = {
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model_name: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 4096,
  reasoning_mode: false,
  output_language: 'en' as const
}

const DEFAULT_SETTINGS = {
  language: 'zh' as const,
  theme: 'light' as const,
  modules: {
    word_refinement: { ...DEFAULT_MODULE_CONFIG, temperature: 0.3 },
    sentence_refinement: { ...DEFAULT_MODULE_CONFIG, temperature: 0.4 },
    paragraph_refinement: { ...DEFAULT_MODULE_CONFIG, temperature: 0.5 },
    paragraph_generation: { ...DEFAULT_MODULE_CONFIG, temperature: 0.8 },
    intent_parser: { ...DEFAULT_MODULE_CONFIG, temperature: 0.2, model_name: 'gpt-4o-mini' },
    ultra_generator: { ...DEFAULT_MODULE_CONFIG, temperature: 0.7, reasoning_mode: true, max_tokens: 8192 },
    ultra_evaluator: { ...DEFAULT_MODULE_CONFIG, temperature: 0.1, model_name: 'gpt-4o' },
    embedding: { ...DEFAULT_MODULE_CONFIG, model_name: 'text-embedding-3-small' }
  },
  customPrompts: {} as Record<string, string>,
  shortcuts: {
    continuePolish: 'Ctrl+Enter',
    startStopPolish: 'Alt+L',
    rename: 'F2',
    newSession: 'Ctrl+N',
    settings: 'Ctrl+,'
  } as Record<string, string>
}

// Env variables set by vite-plugin-electron
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(__dirname, '../../dist')

let mainWindow: BrowserWindow | null = null
let isConfirmedClosing = false

function notifyCopilotStatus(): void {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send('copilot:status', getCopilotProviderStatus())
}

function createWindow(): void {
  isConfirmedClosing = false

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PaperPolish',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    frame: true,
    backgroundColor: '#f8fafc',
    show: false
  })

  // Remote documents must never inherit the preload bridge and its access to settings.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())

  // Show window when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  mainWindow.on('close', (event) => {
    if (isConfirmedClosing) {
      return
    }

    event.preventDefault()
    mainWindow?.webContents.send('app:before-close')
  })
}

// ===== IPC Handlers =====

function registerIpcHandlers(): void {
  // Settings
  ipcMain.handle('settings:get', () => {
    return getInMemorySettings(DEFAULT_SETTINGS)
  })

  ipcMain.handle('settings:set', (_event, settings) => {
    setInMemorySettings(settings)
  })

  ipcMain.handle('settings:persist', (_event, settings) => {
    const filePath = persistSettings(settings)
    return filePath
  })

  ipcMain.handle('settings:get-path', () => {
    return getSettingsPath()
  })

  ipcMain.handle('copilot:status:get', () => {
    return getCopilotProviderStatus()
  })

  ipcMain.handle(
    'app:confirm-close',
    (
      _event,
      saveOptions: { prompts: boolean; apiConfig: boolean; modelParams: boolean }
    ) => {
      if (saveOptions.prompts || saveOptions.apiConfig || saveOptions.modelParams) {
        const currentSettings = getInMemorySettings(DEFAULT_SETTINGS)
        const originalSettings = loadSettings(DEFAULT_SETTINGS)

        if (saveOptions.apiConfig) {
          Object.keys(currentSettings.modules).forEach((key) => {
            const moduleKey = key as keyof typeof currentSettings.modules
            originalSettings.modules[moduleKey].base_url =
              currentSettings.modules[moduleKey].base_url
            originalSettings.modules[moduleKey].api_key =
              currentSettings.modules[moduleKey].api_key
          })
        }

        if (saveOptions.modelParams) {
          Object.keys(currentSettings.modules).forEach((key) => {
            const moduleKey = key as keyof typeof currentSettings.modules
            originalSettings.modules[moduleKey].temperature =
              currentSettings.modules[moduleKey].temperature
            originalSettings.modules[moduleKey].max_tokens =
              currentSettings.modules[moduleKey].max_tokens
            originalSettings.modules[moduleKey].model_name = currentSettings.modules[moduleKey].model_name
            originalSettings.modules[moduleKey].reasoning_mode = currentSettings.modules[moduleKey].reasoning_mode
            originalSettings.modules[moduleKey].output_language = currentSettings.modules[moduleKey].output_language
          })
        }

        if (saveOptions.prompts) {
          originalSettings.customPrompts = { ...currentSettings.customPrompts }
        }

        setInMemorySettings(originalSettings)
        saveSettings(originalSettings)
      }

      if (mainWindow) {
        isConfirmedClosing = true
        mainWindow.destroy()
      }
    }
  )

  ipcMain.handle('app:cancel-close', () => {
    return
  })

  // LLM Streaming
  ipcMain.handle('llm:start-stream', (event, params) => {
    return (async () => {
      const settings = getInMemorySettings(DEFAULT_SETTINGS)
      const moduleConfig = settings.modules[params.moduleKey as keyof typeof settings.modules]

      if (!moduleConfig) {
        return Promise.reject(new Error(`Unknown module: ${params.moduleKey}`))
      }

      const resolvedConfig = await resolveModuleConfig(moduleConfig)

      if (!resolvedConfig.api_key) {
        throw new Error('API key not configured / API 密钥未配置。请在设置中配置对应模块的 API Key。')
      }

      const requestId = params._requestId || crypto.randomUUID()
      return startStream(params.messages, resolvedConfig, (chunk) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('llm:stream-chunk', requestId, chunk)
        }
      }, requestId)
    })()
  })

  ipcMain.handle('llm:abort-stream', (_event, requestId: string) => {
    return abortStream(requestId)
  })

  // File export
  ipcMain.handle('export:markdown', async (_event, content: string, defaultName: string) => {
    if (!mainWindow) return false

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Markdown',
      defaultPath: defaultName,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) return false

    try {
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('export:file', async (_event, content: string, defaultName: string, format: string) => {
    if (!mainWindow) return false
    const filters = format === 'json'
      ? [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Markdown', extensions: ['md'] }, { name: 'Text', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }]

    const result = await dialog.showSaveDialog(mainWindow, {
      title: format === 'json' ? 'Export JSON' : 'Export Markdown',
      defaultPath: defaultName,
      filters
    })
    if (result.canceled || !result.filePath) return false
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  })

  // ===== Database: Documents =====
  ipcMain.handle('db:documents:get', () => {
    return getDocuments()
  })

  ipcMain.handle('db:documents:create', (_event, name: string) => {
    const id = crypto.randomUUID()
    return createDocument(id, name)
  })

  ipcMain.handle('db:documents:delete', (_event, id: string) => {
    deleteDocument(id)
  })

  // ===== Database: Terminology =====
  ipcMain.handle('db:terminology:get', (_event, documentId: string) => {
    return getTerminology(documentId)
  })

  ipcMain.handle('db:terminology:add', (_event, documentId: string, term: string, definition: string) => {
    const id = crypto.randomUUID()
    return addTerm(id, documentId, term, definition)
  })

  ipcMain.handle('db:terminology:update', (_event, id: string, term: string, definition: string) => {
    updateTerm(id, term, definition)
  })

  ipcMain.handle('db:terminology:delete', (_event, id: string) => {
    deleteTerm(id)
  })

  ipcMain.handle('db:terminology:search', (_event, documentId: string, query: string) => {
    return searchTerms(documentId, query)
  })

  // ===== Database: Professional Terminology =====
  ipcMain.handle('db:pro-terminology:get', () => getProTerminology())
  ipcMain.handle('db:pro-terminology:add', (_event, term: string, definition: string) => {
    const id = crypto.randomUUID()
    return addProTerm(id, term, definition)
  })
  ipcMain.handle('db:pro-terminology:update', (_event, id: string, term: string, definition: string) => {
    updateProTerm(id, term, definition)
  })
  ipcMain.handle('db:pro-terminology:delete', (_event, id: string) => {
    deleteProTerm(id)
  })
  ipcMain.handle('db:pro-terminology:search', (_event, query: string) => {
    return searchProTerms(query)
  })

  // ===== Database: Folder Terminology =====
  ipcMain.handle('db:folder-terminology:get', (_event, folderId: string) => getFolderTerminology(folderId))
  ipcMain.handle('db:folder-terminology:add', (_event, folderId: string, term: string, definition: string) => {
    const id = `ft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return addFolderTerm(id, folderId, term, definition)
  })
  ipcMain.handle('db:folder-terminology:update', (_event, id: string, term: string, definition: string) => updateFolderTerm(id, term, definition))
  ipcMain.handle('db:folder-terminology:delete', (_event, id: string) => deleteFolderTerm(id))
  ipcMain.handle('db:folder-terminology:search', (_event, folderId: string, query: string) => searchFolderTerms(folderId, query))

  // ===== Database: Polish Sessions =====
  ipcMain.handle('db:sessions:list', () => getPolishSessions())
  ipcMain.handle('db:sessions:get', (_event, id: string) => getPolishSession(id))
  ipcMain.handle('db:sessions:save', (_event, id: string, name: string, data: string) => {
    savePolishSession(id, name, data)
  })
  ipcMain.handle('db:sessions:delete', (_event, id: string) => {
    deletePolishSession(id)
  })

  // ===== Database: Folders =====
  ipcMain.handle('db:folders:load', () => getAllFolders())
  ipcMain.handle('db:folders:save', (_event, foldersJSON: string) => {
    const folders = JSON.parse(foldersJSON)
    saveAllFolders(folders)
  })

  // ===== Database: Reference Articles =====
  ipcMain.handle('db:references:get', () => {
    return getReferenceArticles()
  })

  ipcMain.handle('db:references:add', (_event, title: string, content: string, source: string) => {
    const id = crypto.randomUUID()
    return addReferenceArticle(id, title, content, source)
  })

  ipcMain.handle('db:references:update', (_event, id: string, title: string, content: string, source: string) => {
    updateReferenceArticle(id, title, content, source)
  })

  ipcMain.handle('db:references:delete', (_event, id: string) => {
    deleteReferenceArticle(id)
  })

  // ===== Database: Embeddings =====
  ipcMain.handle('db:embeddings:get', (_event, articleId: string) => {
    return getArticleEmbeddings(articleId)
  })

  ipcMain.handle('db:embeddings:embed', async (_event, articleId: string) => {
    const settings = getInMemorySettings(DEFAULT_SETTINGS)
    const embeddingConfig = await resolveModuleConfig(settings.modules.embedding)
    if (!embeddingConfig.api_key) {
      throw new Error('Embedding API key not configured / 嵌入模型 API 密钥未配置')
    }
    await embedArticle(articleId, embeddingConfig)
  })

  ipcMain.handle('db:embeddings:search', async (_event, queryText: string, topK: number) => {
    const settings = getInMemorySettings(DEFAULT_SETTINGS)
    const embeddingConfig = await resolveModuleConfig(settings.modules.embedding)
    if (!embeddingConfig.api_key) {
      throw new Error('Embedding API key not configured / 嵌入模型 API 密钥未配置')
    }
    return searchSimilarChunks(queryText, embeddingConfig, topK)
  })
}

// ===== App Lifecycle =====

app.whenReady().then(() => {
  // Initialize database before registering handlers
  initDatabase()
  initTempSettings(DEFAULT_SETTINGS)

  registerIpcHandlers()
  createWindow()

  const settings = getInMemorySettings(DEFAULT_SETTINGS)
  if (Object.values(settings.modules).some(config => isCopilotProvider(config.base_url))) {
    void ensureCopilotProviderReady().then(notifyCopilotStatus)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      notifyCopilotStatus()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupTempSettings()
    closeDatabase()
    app.quit()
  }
})

app.on('before-quit', () => {
  cleanupTempSettings()
  closeDatabase()
})
