/**
 * Preload script — exposes safe APIs to renderer via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron'

// Track listeners for cleanup
type ChunkCallback = (requestId: string, chunk: unknown) => void
type CopilotStatusCallback = (status: unknown) => void
let chunkListeners: ChunkCallback[] = []

contextBridge.exposeInMainWorld('api', {
  // ===== Settings =====
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: unknown) => ipcRenderer.invoke('settings:set', settings),
  persistSettings: (settings: unknown) => ipcRenderer.invoke('settings:persist', settings),
  getConfigPath: () => ipcRenderer.invoke('settings:get-path'),
  onBeforeClose: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:before-close', handler)
    return () => ipcRenderer.removeListener('app:before-close', handler)
  },
  confirmClose: (saveOptions: { prompts: boolean; apiConfig: boolean; modelParams: boolean }) =>
    ipcRenderer.invoke('app:confirm-close', saveOptions),
  cancelClose: () => ipcRenderer.invoke('app:cancel-close'),
  getCopilotStatus: () => ipcRenderer.invoke('copilot:status:get'),
  onCopilotStatus: (callback: CopilotStatusCallback) => {
    const handler = (_event: unknown, status: unknown) => callback(status)
    ipcRenderer.on('copilot:status', handler as (...args: unknown[]) => void)
    return () => ipcRenderer.removeListener('copilot:status', handler as (...args: unknown[]) => void)
  },

  // ===== LLM Streaming =====
  startStream: async (params: unknown) => {
    const p = params as Record<string, unknown>
    const requestId = p._requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Start stream in main process
    return ipcRenderer.invoke('llm:start-stream', { ...p, _requestId: requestId })
  },

  abortStream: (requestId: string) => ipcRenderer.invoke('llm:abort-stream', requestId),

  onStreamChunk: (callback: ChunkCallback) => {
    const handler = (_event: unknown, requestId: string, chunk: unknown) => {
      callback(requestId, chunk)
    }

    ipcRenderer.on('llm:stream-chunk', handler as (...args: unknown[]) => void)
    chunkListeners.push(callback)

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('llm:stream-chunk', handler as (...args: unknown[]) => void)
      chunkListeners = chunkListeners.filter(l => l !== callback)
    }
  },

  // ===== File Export =====
  exportMarkdown: (content: string, defaultName: string) =>
    ipcRenderer.invoke('export:markdown', content, defaultName),
  exportFile: (content: string, defaultName: string, format: string) =>
    ipcRenderer.invoke('export:file', content, defaultName, format),

  // ===== Terminology =====
  getTerminology: (documentId: string) => ipcRenderer.invoke('db:terminology:get', documentId),
  addTerm: (documentId: string, term: string, definition: string) =>
    ipcRenderer.invoke('db:terminology:add', documentId, term, definition),
  updateTerm: (id: string, term: string, definition: string) =>
    ipcRenderer.invoke('db:terminology:update', id, term, definition),
  deleteTerm: (id: string) => ipcRenderer.invoke('db:terminology:delete', id),
  searchTerms: (documentId: string, query: string) =>
    ipcRenderer.invoke('db:terminology:search', documentId, query),

  // ===== Professional Terminology (Global) =====
  getProTerminology: () => ipcRenderer.invoke('db:pro-terminology:get'),
  addProTerm: (term: string, definition: string) =>
    ipcRenderer.invoke('db:pro-terminology:add', term, definition),
  updateProTerm: (id: string, term: string, definition: string) =>
    ipcRenderer.invoke('db:pro-terminology:update', id, term, definition),
  deleteProTerm: (id: string) => ipcRenderer.invoke('db:pro-terminology:delete', id),
  searchProTerms: (query: string) =>
    ipcRenderer.invoke('db:pro-terminology:search', query),

  // ===== Folder Terminology (Per-Folder) =====
  getFolderTerminology: (folderId: string) => ipcRenderer.invoke('db:folder-terminology:get', folderId),
  addFolderTerm: (folderId: string, term: string, definition: string) =>
    ipcRenderer.invoke('db:folder-terminology:add', folderId, term, definition),
  updateFolderTerm: (id: string, term: string, definition: string) =>
    ipcRenderer.invoke('db:folder-terminology:update', id, term, definition),
  deleteFolderTerm: (id: string) => ipcRenderer.invoke('db:folder-terminology:delete', id),
  searchFolderTerms: (folderId: string, query: string) =>
    ipcRenderer.invoke('db:folder-terminology:search', folderId, query),

  // ===== Polish Sessions (Persistence) =====
  listPolishSessions: () => ipcRenderer.invoke('db:sessions:list'),
  getPolishSession: (id: string) => ipcRenderer.invoke('db:sessions:get', id),
  savePolishSession: (id: string, name: string, data: string) =>
    ipcRenderer.invoke('db:sessions:save', id, name, data),
  deletePolishSession: (id: string) => ipcRenderer.invoke('db:sessions:delete', id),

  // ===== Folders (Persistence) =====
  loadFolders: () => ipcRenderer.invoke('db:folders:load'),
  saveFolders: (foldersJSON: string) => ipcRenderer.invoke('db:folders:save', foldersJSON),

  // ===== Reference Articles =====
  getReferenceArticles: () => ipcRenderer.invoke('db:references:get'),
  addReferenceArticle: (title: string, content: string, source: string) =>
    ipcRenderer.invoke('db:references:add', title, content, source),
  updateReferenceArticle: (id: string, title: string, content: string, source: string) =>
    ipcRenderer.invoke('db:references:update', id, title, content, source),
  deleteReferenceArticle: (id: string) => ipcRenderer.invoke('db:references:delete', id),

  // ===== Embeddings =====
  embedArticle: (articleId: string) => ipcRenderer.invoke('db:embeddings:embed', articleId),
  getArticleEmbeddings: (articleId: string) => ipcRenderer.invoke('db:embeddings:get', articleId),
  searchSimilar: (query: string, topK: number) => ipcRenderer.invoke('db:embeddings:search', query, topK),

  // ===== Documents =====
  getDocuments: () => ipcRenderer.invoke('db:documents:get'),
  createDocument: (name: string) => ipcRenderer.invoke('db:documents:create', name),
  deleteDocument: (id: string) => ipcRenderer.invoke('db:documents:delete', id)
})
