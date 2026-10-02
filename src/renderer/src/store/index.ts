import { create } from 'zustand'
import type {
  Language,
  PolishScope,
  PolishMode,
  ModuleKey,
  AppSettings,
  PolishSession,
  FolderNode,
  PersistedSessionSummary,
  KeyPoint,
  PolishHistoryNode,
  StreamChunk,
  UltraIteration
} from '../types'
import { DEFAULT_SETTINGS } from '../types'

type PersistedSessionRow = {
  id: string
  name: string
  data: string
  created_at: number
  updated_at: number
}

type PersistApi = typeof window.api & {
  listPolishSessions: () => Promise<PersistedSessionSummary[]>
  savePolishSession: (id: string, name: string, dataJSON: string) => Promise<void>
  getPolishSession: (id: string) => Promise<PersistedSessionRow | null>
  deletePolishSession: (id: string) => Promise<void>
  persistSettings?: (settings: AppSettings) => Promise<string>
  getConfigPath?: () => Promise<string>
  loadFolders?: () => Promise<Array<{ id: string; name: string; parent_id: string | null; created_at: number }>>
  saveFolders?: (foldersJSON: string) => Promise<void>
}

type PersistedFolderRow = {
  id: string
  name: string
  parent_id: string | null
  created_at: number
}


function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createHistoryNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createKeyPointId(): string {
  return `kp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

let _folderSaveTimer: ReturnType<typeof setTimeout> | null = null
let _sessionSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

function debouncedPersistFolders(folders: FolderNode[]): void {
  if (_folderSaveTimer) clearTimeout(_folderSaveTimer)
  _folderSaveTimer = setTimeout(() => {
    const api = window.api as PersistApi | undefined
    if (!api?.saveFolders) return
    const foldersData = folders.map(f => ({
      id: f.id,
      name: f.name,
      parent_id: f.parentId,
      created_at: f.createdAt
    }))
    api.saveFolders(JSON.stringify(foldersData)).catch(err => console.error('Failed to persist folders:', err))
  }, 2000)
}

async function persistFoldersNow(folders: FolderNode[]): Promise<void> {
  const api = window.api as PersistApi | undefined
  if (!api?.saveFolders) return
  const foldersData = folders.map(f => ({
    id: f.id,
    name: f.name,
    parent_id: f.parentId,
    created_at: f.createdAt
  }))
  await api.saveFolders(JSON.stringify(foldersData))
}

function debouncedPersistSession(session: PolishSession): void {
  const existing = _sessionSaveTimers.get(session.id)
  if (existing) clearTimeout(existing)
  _sessionSaveTimers.set(session.id, setTimeout(() => {
    _sessionSaveTimers.delete(session.id)
    const api = window.api as PersistApi | undefined
    if (!api) return
    const data = JSON.stringify(session)
    const name = session.name || session.inputText.slice(0, 30) || 'Untitled'
    api.savePolishSession(session.id, name, data).catch(err => console.error('Failed to auto-save session:', err))
  }, 2000))
}

async function persistSessionNow(session: PolishSession): Promise<void> {
  const api = window.api as PersistApi | undefined
  if (!api) return
  const data = JSON.stringify(session)
  const name = session.name || session.inputText.slice(0, 30) || 'Untitled'
  await api.savePolishSession(session.id, name, data)
}

interface AppState {
  // Settings
  settings: AppSettings
  settingsLoaded: boolean
  settingsOpen: boolean
  sidebarCollapsed: boolean
  selectedFolderId: string | null

  // Session management
  sessions: PolishSession[]
  folders: FolderNode[]
  activeSessionId: string | null
  renameSessionRequestToken: number
  renameItemRequestToken: number
  persistedSessions: PersistedSessionSummary[]

  // Polishing state
  isPolishing: boolean
  streamingContent: string
  streamingReasoning: string
  currentRequestId: string | null

  // Feedback
  feedbackText: string

  // Toast notifications
  toastMessage: string | null
  toastType: 'success' | 'error' | 'info'
  historyTreeOpen: boolean

  // Options toggles
  useLlmKeypoints: boolean
  autoExtractEnabled: boolean
  autoRecommendTerms: boolean

  // Flow transition modal state
  flowTransitionOpen: boolean

  // Actions — Settings
  loadSettings: () => Promise<void>
  updateSettings: (settings: AppSettings) => Promise<void>
  persistSettings: () => Promise<void>
  updateModuleModel: (moduleKey: ModuleKey, modelName: string) => Promise<void>
  setSettingsOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Actions — Sessions
  createSession: (name?: string, folderId?: string | null) => string
  renameSession: (id: string, name: string) => void
  requestRenameActiveSession: () => void
  setSelectedFolderId: (folderId: string | null) => void
  requestRenameSelectedItem: () => void
  setActiveSession: (id: string | null) => void
  deleteSession: (id: string) => void
  createFolder: (name: string, parentId?: string | null) => string
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  moveSessionToFolder: (sessionId: string, folderId: string | null) => void
  moveFolderToFolder: (folderId: string, targetParentId: string | null) => void
  getActiveSession: () => PolishSession | null
  updateActiveSession: (updates: Partial<PolishSession>) => void

  // Actions — Session Persistence
  loadPersistedSessions: () => Promise<void>
  saveCurrentSession: () => Promise<void>
  loadPersistedSession: (id: string) => Promise<void>
  loadAllPersistedData: () => Promise<void>
  persistFolders: () => void
  flushPersistence: () => Promise<void>
  deletePersistedSession: (id: string) => Promise<void>

  // Actions — Polishing
  setPolishScope: (scope: PolishScope) => void
  setPolishMode: (mode: PolishMode) => void
  startPolishing: () => void
  stopPolishing: () => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (content: string) => void
  setStreamingReasoning: (content: string) => void
  appendStreamingReasoning: (content: string) => void
  setCurrentRequestId: (id: string | null) => void
  finalizePolishing: (outputText: string) => void

  // Actions — Key Points
  addKeyPoint: (text: string) => void
  removeKeyPoint: (id: string) => void
  toggleKeyPoint: (id: string) => void
  updateKeyPoint: (id: string, text: string) => void

  // Actions — History
  addHistoryNode: (text: string) => void
  restoreHistoryNode: (nodeId: string) => void

  // Actions — Feedback
  setFeedbackText: (text: string) => void

  // Actions — Flow transition
  setFlowTransitionOpen: (open: boolean) => void

  // Actions — Toast
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  clearToast: () => void
  setHistoryTreeOpen: (open: boolean) => void

  // Actions — Options toggles
  setUseLlmKeypoints: (val: boolean) => void
  setAutoExtractEnabled: (val: boolean) => void
  setAutoRecommendTerms: (val: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
  settingsOpen: false,
  sidebarCollapsed: false,
  selectedFolderId: null,
  sessions: [],
  folders: [],
  activeSessionId: null,
  renameSessionRequestToken: 0,
  renameItemRequestToken: 0,
  persistedSessions: [],
  isPolishing: false,
  streamingContent: '',
  streamingReasoning: '',
  currentRequestId: null,
  feedbackText: '',
  toastMessage: null,
  toastType: 'info',
  historyTreeOpen: false,
  flowTransitionOpen: false,

  // Options toggles initial state
  useLlmKeypoints: true,
  autoExtractEnabled: false,
  autoRecommendTerms: false,

  // Settings actions
  loadSettings: async () => {
    try {
      if (window.api) {
        const settings = await window.api.getSettings()
        set({ settings, settingsLoaded: true })
      } else {
        console.warn('window.api not available — using default settings')
        set({ settingsLoaded: true })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      set({ settingsLoaded: true })
    }
  },

  updateSettings: async (settings) => {
    try {
      if (window.api) {
        await window.api.setSettings(settings)
      }
      set({ settings })
      get().showToast(
        settings.language === 'zh' ? '设置已应用（临时）' : 'Settings applied (temporary)',
        'success'
      )
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  },

  persistSettings: async () => {
    try {
      const settings = get().settings
      const api = window.api as PersistApi | undefined
      if (api?.persistSettings) {
        await api.persistSettings(settings)
        get().showToast(
          settings.language === 'zh'
            ? '设置已保存'
            : 'Settings saved',
          'success'
        )
      }
    } catch (error) {
      console.error('Failed to persist settings:', error)
      const language = get().settings.language
      get().showToast(
        language === 'zh' ? '设置保存失败，请检查写入权限' : 'Failed to save settings. Please check write permissions.',
        'error'
      )
    }
  },

  updateModuleModel: async (moduleKey, modelName) => {
    const settings = get().settings
    const newSettings = {
      ...settings,
      modules: {
        ...settings.modules,
        [moduleKey]: {
          ...settings.modules[moduleKey],
          model_name: modelName
        }
      }
    }
    if (window.api) {
      await window.api.setSettings(newSettings)
    }
    set({ settings: newSettings })
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  // Session actions
  createSession: (name, folderId = null) => {
    const id = createSessionId()
    const session: PolishSession = {
      id,
      name: name || '',
      createdAt: Date.now(),
      inputText: '',
      outputText: '',
      scope: 'paragraph',
      mode: 'refinement',
      keyPoints: [],
      history: [],
      activeHistoryNodeId: null,
      documentId: null,
      terminologyHighlight: false,
      ultraMode: false,
      ultraMaxIterations: 5,
      ultraIterations: [],
      folderId
    }
    set(state => ({
      sessions: [...state.sessions, session]
    }))
    get().setActiveSession(id)
    debouncedPersistSession(session)
    return id
  },

  renameSession: (id, name) => {
    set(state => ({
      sessions: state.sessions.map(s => s.id === id ? { ...s, name } : s)
    }))
    const session = get().sessions.find(s => s.id === id)
    if (session) debouncedPersistSession(session)
  },

  requestRenameActiveSession: () => set(state => ({
    renameSessionRequestToken: state.renameSessionRequestToken + 1
  })),

  setSelectedFolderId: (folderId) => set({ selectedFolderId: folderId }),

  requestRenameSelectedItem: () => set(state => ({
    renameItemRequestToken: state.renameItemRequestToken + 1
  })),

  setActiveSession: (id) => {
    const requestId = get().currentRequestId
    if (requestId && window.api) void window.api.abortStream(requestId).catch(() => {})
    set({
    activeSessionId: id,
    streamingContent: '',
    streamingReasoning: '',
    isPolishing: false,
    currentRequestId: null,
    feedbackText: ''
    })
  },

  deleteSession: (id) => {
    const pendingSave = _sessionSaveTimers.get(id)
    if (pendingSave) clearTimeout(pendingSave)
    _sessionSaveTimers.delete(id)
    if (get().activeSessionId === id) {
      get().setActiveSession(get().sessions.filter(s => s.id !== id).at(-1)?.id || null)
    }
    set(state => {
      const sessions = state.sessions.filter(s => s.id !== id)
      const activeSessionId = state.activeSessionId === id
        ? (sessions.length > 0 ? sessions[sessions.length - 1].id : null)
        : state.activeSessionId
      return { sessions, activeSessionId }
    })
    const api = window.api as PersistApi | undefined
    if (api) {
      api.deletePolishSession(id).catch(err => console.error('Failed to delete persisted session:', err))
    }
  },

  createFolder: (name, parentId = null) => {
    const id = createFolderId()
    const folder: FolderNode = {
      id,
      name,
      parentId,
      createdAt: Date.now()
    }
    set(state => ({
      folders: [...state.folders, folder]
    }))
    debouncedPersistFolders(get().folders)
    return id
  },

  renameFolder: (id, name) => {
    set(state => ({
      folders: state.folders.map(folder => folder.id === id ? { ...folder, name } : folder)
    }))
    debouncedPersistFolders(get().folders)
  },

  deleteFolder: (id) => {
    set(state => {
      const folderToDelete = state.folders.find(folder => folder.id === id)
      if (!folderToDelete) return state
      const targetParentId = folderToDelete.parentId
      return {
        folders: state.folders
          .filter(folder => folder.id !== id)
          .map(folder => folder.parentId === id ? { ...folder, parentId: targetParentId } : folder),
        sessions: state.sessions.map(session =>
          session.folderId === id ? { ...session, folderId: targetParentId } : session
        )
      }
    })
    debouncedPersistFolders(get().folders)
    get().sessions.forEach(s => debouncedPersistSession(s))
  },

  moveSessionToFolder: (sessionId, folderId) => {
    set(state => ({
      sessions: state.sessions.map(session =>
        session.id === sessionId ? { ...session, folderId } : session
      )
    }))
    const session = get().sessions.find(s => s.id === sessionId)
    if (session) debouncedPersistSession(session)
  },

  moveFolderToFolder: (folderId, targetParentId) => {
    set(state => {
      if (folderId === targetParentId) return state

      const parentMap = new Map(state.folders.map(folder => [folder.id, folder.parentId]))
      let cursor = targetParentId
      while (cursor) {
        if (cursor === folderId) return state
        cursor = parentMap.get(cursor) ?? null
      }

      return {
        folders: state.folders.map(folder =>
          folder.id === folderId ? { ...folder, parentId: targetParentId } : folder
        )
      }
    })
    debouncedPersistFolders(get().folders)
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find(s => s.id === activeSessionId) || null
  },

  updateActiveSession: (updates) => {
    set(state => {
      const { activeSessionId } = state
      if (!activeSessionId) return state
      return {
        sessions: state.sessions.map(s =>
          s.id === activeSessionId ? { ...s, ...updates } : s
        )
      }
    })
    const session = get().getActiveSession()
    if (session) debouncedPersistSession(session)
  },

  loadPersistedSessions: async () => {
    const api = window.api as PersistApi | undefined
    if (!api) return
    try {
      const sessions = await api.listPolishSessions()
      set({ persistedSessions: sessions })
    } catch (error) {
      console.error('Failed to load persisted sessions:', error)
    }
  },

  loadAllPersistedData: async () => {
    const api = window.api as PersistApi | undefined
    if (!api) return
    let summaries: PersistedSessionSummary[] = []
    let fullSessions: PolishSession[] = []
    let folders: FolderNode[] = []

    try {
      summaries = await api.listPolishSessions()
      fullSessions = (await Promise.all(
        summaries.map(async (summary) => {
          try {
            const row = await api.getPolishSession(summary.id)
            if (!row?.data) return null
            return JSON.parse(row.data) as PolishSession
          } catch {
            console.warn('Failed to parse session data for:', summary.id)
            return null
          }
        })
      )).filter((session): session is PolishSession => session !== null)
    } catch (error) {
      console.error('Failed to load persisted sessions:', error)
    }

    try {
      if (api.loadFolders) {
        const folderRows = await api.loadFolders() as PersistedFolderRow[]
        folders = folderRows.map(r => ({
          id: r.id,
          name: r.name,
          parentId: r.parent_id,
          createdAt: r.created_at
        }))
      }
    } catch (error) {
      console.error('Failed to load persisted folders:', error)
    }

    set({
      persistedSessions: summaries,
      sessions: fullSessions,
      folders,
      activeSessionId: fullSessions[0]?.id ?? null
    })
  },

  persistFolders: () => {
    const { folders } = get()
    debouncedPersistFolders(folders)
  },

  flushPersistence: async () => {
    if (_folderSaveTimer) {
      clearTimeout(_folderSaveTimer)
      _folderSaveTimer = null
    }

    for (const timer of _sessionSaveTimers.values()) {
      clearTimeout(timer)
    }
    _sessionSaveTimers.clear()

    const { folders, sessions } = get()

    try {
      await persistFoldersNow(folders)
      await Promise.all(sessions.map(session => persistSessionNow(session)))
      await get().loadPersistedSessions()
    } catch (error) {
      console.error('Failed to flush persistence:', error)
    }
  },

  saveCurrentSession: async () => {
    const session = get().getActiveSession()
    const api = window.api as PersistApi | undefined
    if (!session || !api) return
    try {
      const data = JSON.stringify(session)
      const name = session.name || session.inputText.slice(0, 30) || 'Untitled'
      await api.savePolishSession(session.id, name, data)
      await get().loadPersistedSessions()
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  },

  loadPersistedSession: async (id) => {
    const api = window.api as PersistApi | undefined
    if (!api) return
    try {
      const row = await api.getPolishSession(id)
      if (!row) return
      const sessionData = JSON.parse(row.data) as PolishSession
      const existing = get().sessions.find(s => s.id === sessionData.id)
      if (existing) {
        set({ activeSessionId: sessionData.id })
      } else {
        set(state => ({
          sessions: [...state.sessions, sessionData],
          activeSessionId: sessionData.id,
          streamingContent: '',
          streamingReasoning: '',
          isPolishing: false,
          currentRequestId: null,
          feedbackText: ''
        }))
      }
    } catch (error) {
      console.error('Failed to load persisted session:', error)
    }
  },

  deletePersistedSession: async (id) => {
    const api = window.api as PersistApi | undefined
    if (!api) return
    try {
      await api.deletePolishSession(id)
      await get().loadPersistedSessions()
    } catch (error) {
      console.error('Failed to delete persisted session:', error)
    }
  },

  // Polish scope/mode
  setPolishScope: (scope) => {
    get().updateActiveSession({ scope })
  },

  setPolishMode: (mode) => {
    get().updateActiveSession({ mode })
  },

  // Polishing actions
  startPolishing: () => set({ isPolishing: true, streamingContent: '', streamingReasoning: '' }),
  stopPolishing: () => set({ isPolishing: false, currentRequestId: null }),

  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (content) => set(state => ({
    streamingContent: state.streamingContent + content
  })),
  setStreamingReasoning: (content) => set({ streamingReasoning: content }),
  appendStreamingReasoning: (content) => set(state => ({
    streamingReasoning: state.streamingReasoning + content
  })),
  setCurrentRequestId: (id) => set({ currentRequestId: id }),

  finalizePolishing: (outputText) => {
    const store = get()
    store.updateActiveSession({ outputText })
    store.addHistoryNode(outputText)
    set({ isPolishing: false, currentRequestId: null })
    store.saveCurrentSession()
  },

  // Key Points
  addKeyPoint: (text) => {
    const session = get().getActiveSession()
    if (!session) return
    const newKP: KeyPoint = { id: createKeyPointId(), text, checked: true }
    get().updateActiveSession({
      keyPoints: [...session.keyPoints, newKP]
    })
  },

  removeKeyPoint: (id) => {
    const session = get().getActiveSession()
    if (!session) return
    get().updateActiveSession({
      keyPoints: session.keyPoints.filter(kp => kp.id !== id)
    })
  },

  toggleKeyPoint: (id) => {
    const session = get().getActiveSession()
    if (!session) return
    get().updateActiveSession({
      keyPoints: session.keyPoints.map(kp =>
        kp.id === id ? { ...kp, checked: !kp.checked } : kp
      )
    })
  },

  updateKeyPoint: (id, text) => {
    const session = get().getActiveSession()
    if (!session) return
    get().updateActiveSession({
      keyPoints: session.keyPoints.map(kp =>
        kp.id === id ? { ...kp, text } : kp
      )
    })
  },

  // History
  addHistoryNode: (text) => {
    const session = get().getActiveSession()
    if (!session) return
    const node: PolishHistoryNode = {
      id: createHistoryNodeId(),
      text,
      inputText: session.inputText,
      timestamp: Date.now(),
      parentId: session.activeHistoryNodeId,
      scope: session.scope,
      mode: session.mode
    }
    get().updateActiveSession({
      history: [...session.history, node],
      activeHistoryNodeId: node.id
    })
  },

  restoreHistoryNode: (nodeId) => {
    const session = get().getActiveSession()
    if (!session) return
    const node = session.history.find(n => n.id === nodeId)
    if (!node) return
    get().updateActiveSession({
      outputText: node.text,
      inputText: node.inputText || session.inputText,
      activeHistoryNodeId: nodeId
    })
  },

  // Feedback
  setFeedbackText: (text) => set({ feedbackText: text }),

  // Flow transition
  setFlowTransitionOpen: (open) => set({ flowTransitionOpen: open }),

  // Toast
  showToast: (message, type = 'info') => {
    set({ toastMessage: message, toastType: type })
    setTimeout(() => {
      set(state => state.toastMessage === message ? { toastMessage: null } : state)
    }, 3000)
  },
  clearToast: () => set({ toastMessage: null }),
  setHistoryTreeOpen: (open) => set({ historyTreeOpen: open }),

  // Options toggles
  setUseLlmKeypoints: (val) => set({ useLlmKeypoints: val }),
  setAutoExtractEnabled: (val) => set({ autoExtractEnabled: val }),
  setAutoRecommendTerms: (val) => set({ autoRecommendTerms: val }),
}))
