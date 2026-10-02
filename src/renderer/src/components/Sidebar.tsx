import React from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import {
  Plus,
  FileText,
  Settings,
  CircleHelp,
  Trash2,
  Sparkles,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Pencil,
  Search,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon
} from 'lucide-react'
import LanguageToggle from './LanguageToggle'

export default function Sidebar({ onOpenHelp }: { onOpenHelp: () => void }) {
  const { t } = useI18n()
  const {
    sessions,
    activeSessionId,
    createSession,
    setActiveSession,
    deleteSession,
    setSettingsOpen,
    persistedSessions,
    loadAllPersistedData,
    loadPersistedSession,
    deletePersistedSession,
    renameSession,
    renameSessionRequestToken,
    renameItemRequestToken,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    moveSessionToFolder,
    moveFolderToFolder,
    setHistoryTreeOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    settings,
    updateSettings
  } = useAppStore()

  const [editingSessionId, setEditingSessionId] = React.useState<string | null>(null)
  const [editSessionName, setEditSessionName] = React.useState('')
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set())
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null)
  const [editFolderName, setEditFolderName] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [dragOverFolderId, setDragOverFolderId] = React.useState<string | null>(null)
  const [rootDropActive, setRootDropActive] = React.useState(false)

  React.useEffect(() => {
    loadAllPersistedData()
  }, [loadAllPersistedData])

  const lastRenameTokenRef = React.useRef(0)
  const lastRenameItemTokenRef = React.useRef(renameItemRequestToken)

  React.useEffect(() => {
    if (!renameSessionRequestToken || renameSessionRequestToken === lastRenameTokenRef.current) return
    lastRenameTokenRef.current = renameSessionRequestToken
    if (!activeSessionId) return
    const activeSession = sessions.find(session => session.id === activeSessionId)
    if (activeSession) {
      setEditingSessionId(activeSession.id)
      setEditSessionName(activeSession.name || '')
    }
  }, [renameSessionRequestToken, activeSessionId, sessions])

  React.useEffect(() => {
    if (renameItemRequestToken === lastRenameItemTokenRef.current) return
    lastRenameItemTokenRef.current = renameItemRequestToken

    if (selectedFolderId) {
      const folder = folders.find(f => f.id === selectedFolderId)
      if (folder) {
        setEditingSessionId(null)
        setEditingFolderId(folder.id)
        setEditFolderName(folder.name)
        return
      }
    }

    if (activeSessionId) {
      const session = sessions.find(s => s.id === activeSessionId)
      if (session) {
        setEditingFolderId(null)
        setEditingSessionId(session.id)
        setEditSessionName(session.name || '')
      }
    }
  }, [renameItemRequestToken, selectedFolderId, activeSessionId, sessions, folders])

  const handleNewSession = () => {
    createSession()
  }

  const handleCreateSessionInFolder = (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation()
    const sessionId = createSession(undefined, folderId)
    setExpandedFolders(prev => new Set(prev).add(folderId))
    setActiveSession(sessionId)
  }

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteSession(id)
  }

  const handleDeletePersistedSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deletePersistedSession(id)
  }

  const startRenameSession = (id: string, currentName: string) => {
    setEditingSessionId(id)
    setEditSessionName(currentName || '')
  }

  const saveRenameSession = () => {
    if (editingSessionId && editSessionName.trim()) {
      renameSession(editingSessionId, editSessionName.trim())
    }
    setEditingSessionId(null)
  }

  const cancelRenameSession = () => {
    setEditingSessionId(null)
    setEditSessionName('')
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const startRenameFolder = (id: string, currentName: string) => {
    setEditingFolderId(id)
    setEditFolderName(currentName)
  }

  const saveRenameFolder = () => {
    if (editingFolderId && editFolderName.trim()) {
      renameFolder(editingFolderId, editFolderName.trim())
    }
    setEditingFolderId(null)
    setEditFolderName('')
  }

  const cancelRenameFolder = () => {
    setEditingFolderId(null)
    setEditFolderName('')
  }

  const persistedOnlySessions = React.useMemo(() => {
    return persistedSessions.filter(ps => !sessions.some(s => s.id === ps.id))
  }, [persistedSessions, sessions])

  const rootSessions = React.useMemo(() => {
    return sessions.filter(s => !s.folderId)
  }, [sessions])

  const rootFolders = React.useMemo(() => {
    return folders.filter(f => f.parentId === null)
  }, [folders])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const filteredSessions = React.useMemo(() => {
    if (!normalizedSearchQuery) return []
    return sessions
      .filter(session => (session.name || t.sidebar.untitled).toLowerCase().includes(normalizedSearchQuery))
      .reverse()
  }, [normalizedSearchQuery, sessions, t.sidebar.untitled])

  const filteredFolders = React.useMemo(() => {
    if (!normalizedSearchQuery) return []
    return folders.filter(folder => folder.name.toLowerCase().includes(normalizedSearchQuery))
  }, [normalizedSearchQuery, folders])

  const filteredPersistedSessions = React.useMemo(() => {
    if (!normalizedSearchQuery) return []
    return persistedOnlySessions.filter(ps =>
      (ps.name || t.sidebar.untitled).toLowerCase().includes(normalizedSearchQuery)
    )
  }, [normalizedSearchQuery, persistedOnlySessions, t.sidebar.untitled])

  const handleSessionDragStart = (e: React.DragEvent<HTMLDivElement>, sessionId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `session:${sessionId}`)
  }

  const handleRootDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setRootDropActive(true)
  }

  const handleRootDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain')
    if (raw.startsWith('session:')) {
      const sessionId = raw.slice('session:'.length)
      if (sessionId) moveSessionToFolder(sessionId, null)
    } else if (raw.startsWith('folder:')) {
      const folderId = raw.slice('folder:'.length)
      if (folderId) moveFolderToFolder(folderId, null)
    }
    setRootDropActive(false)
    setDragOverFolderId(null)
  }

  const renderSessionRow = (session: (typeof sessions)[number]) => {
    const isEditing = editingSessionId === session.id
    return (
      <div
        key={session.id}
        onClick={() => {
          setSelectedFolderId(null)
          setActiveSession(session.id)
        }}
        draggable
        onDragStart={(e) => handleSessionDragStart(e, session.id)}
        className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-100 ${
          activeSessionId === session.id
            ? 'bg-primary-50 text-primary-700 border border-primary-200'
            : 'hover:bg-surface-50 text-surface-600'
        }`}
      >
        <FileText size={14} className="shrink-0 opacity-60" />
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              autoFocus
              value={editSessionName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditSessionName(e.target.value)}
              onBlur={saveRenameSession}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
                if (e.key === 'Escape') cancelRenameSession()
              }}
              className="w-full text-sm px-1.5 py-0.5 rounded border border-primary-300 bg-white"
            />
          ) : (
            <p
              className="text-sm truncate"
              title={session.name || t.sidebar.untitled}
              onDoubleClick={(e) => {
                e.stopPropagation()
                startRenameSession(session.id, session.name)
              }}
            >
              {session.name || t.sidebar.untitled}
            </p>
          )}
          <p className="text-[10px] text-surface-400 mt-0.5">{formatTime(session.createdAt)}</p>
        </div>
        <button
          onClick={(e) => handleDeleteSession(e, session.id)}
          className="hidden group-hover:inline-flex p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all shrink-0"
          title={t.common.delete}
        >
          <Trash2 size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setActiveSession(session.id)
            setHistoryTreeOpen(true)
          }}
          className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all shrink-0"
          title={t.tooltips.historyTree}
        >
          <GitBranch size={12} />
        </button>
      </div>
    )
  }

  const renderFolder = (folderId: string): React.ReactNode => {
    const folder = folders.find(f => f.id === folderId)
    if (!folder) return null

    const isExpanded = expandedFolders.has(folderId)
    const childFolders = folders.filter(f => f.parentId === folderId)
    const childSessions = sessions.filter(s => s.folderId === folderId)
    const isEditing = editingFolderId === folderId
    const isDragOver = dragOverFolderId === folderId

    return (
      <div key={folderId} className="space-y-0.5">
        <div
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-surface-600 border transition-colors ${
            isDragOver
              ? 'bg-primary-50 border-primary-200'
              : selectedFolderId === folderId
                ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-200'
              : 'hover:bg-surface-50 border-transparent'
          }`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            setSelectedFolderId(folderId)
          }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', `folder:${folderId}`)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOverFolderId(folderId)
            setRootDropActive(false)
          }}
          onDragLeave={(e) => {
            e.stopPropagation()
            if (dragOverFolderId === folderId) {
              setDragOverFolderId(null)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const raw = e.dataTransfer.getData('text/plain')
            if (raw.startsWith('session:')) {
              const sessionId = raw.slice('session:'.length)
              moveSessionToFolder(sessionId, folderId)
              setExpandedFolders(prev => new Set(prev).add(folderId))
            } else if (raw.startsWith('folder:')) {
              const draggedFolderId = raw.slice('folder:'.length)
              if (draggedFolderId && draggedFolderId !== folderId) {
                moveFolderToFolder(draggedFolderId, folderId)
                setExpandedFolders(prev => new Set(prev).add(folderId))
              }
            }
            setDragOverFolderId(null)
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFolder(folderId)
            }}
            className="p-0.5 rounded hover:bg-surface-100"
            title={isExpanded ? 'Collapse folder' : 'Expand folder'}
          >
            {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </button>
          {isEditing ? (
            <input
              autoFocus
              value={editFolderName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditFolderName(e.target.value)}
              onBlur={saveRenameFolder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
                if (e.key === 'Escape') cancelRenameFolder()
              }}
              className="text-sm flex-1 min-w-0 px-1.5 py-0.5 rounded border border-primary-300 bg-white"
            />
          ) : (
            <span className="text-sm flex-1 min-w-0 truncate" title={folder.name}>{folder.name}</span>
          )}
          <button
            onClick={(e) => handleCreateSessionInFolder(e, folderId)}
            className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all"
            title={t.sidebar.newSession}
          >
            <Plus size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              startRenameFolder(folderId, folder.name)
            }}
            className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all"
            title={t.sidebar.rename}
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              createFolder(t.sidebar.newFolder, folderId)
              setExpandedFolders(prev => new Set(prev).add(folderId))
            }}
            className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all"
            title={t.sidebar.newFolder}
          >
            <FolderPlus size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteFolder(folderId)
            }}
            className="hidden group-hover:inline-flex p-1 hover:text-red-500 rounded transition-all"
            title={t.common.delete}
          >
            <Trash2 size={12} />
          </button>
        </div>
        {isExpanded && (
          <div className="ml-4 space-y-0.5">
            {childFolders.map(child => renderFolder(child.id))}
            {childSessions.map(renderSessionRow)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`${sidebarCollapsed ? 'w-12' : 'w-64'} h-full bg-white border-r border-surface-200 flex flex-col transition-all duration-200`}>
      {/* Logo area */}
      <div className={`${sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-5'} border-b border-surface-100`}>
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-end' : 'justify-between'} gap-2.5`}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-surface-800 truncate">{t.app.title}</h1>
                <p className="text-[10px] text-surface-400 mt-0.5 truncate">{t.app.subtitle}</p>
              </div>
            </div>
          )}
          <button
            className="btn-ghost p-1.5"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? t.sidebar.sessions : t.sidebar.settings}
          >
            {sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
      </div>

      {sidebarCollapsed ? (
        <>
          <div className="flex-1" />
          <div className="border-t border-surface-100 p-2 flex flex-col items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="btn-ghost p-2"
              title={t.sidebar.settings}
            >
              <Settings size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          {/* New session/folder buttons */}
          <div className="p-3 space-y-1.5">
            <button
              onClick={handleNewSession}
              className="btn-primary w-full justify-center"
            >
              <Plus size={16} />
              {t.sidebar.newSession}
            </button>
            <button
              onClick={() => createFolder(t.sidebar.newFolder)}
              className="btn-ghost w-full justify-center text-xs"
            >
              <FolderPlus size={14} />
              {t.sidebar.newFolder}
            </button>
          </div>

          <div className="px-3 pb-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field w-full pl-8 h-8 text-xs"
                placeholder={t.sidebar.search}
              />
            </div>
          </div>

          {/* Session list */}
          <div
            className={`flex-1 overflow-y-auto px-2 transition-colors ${rootDropActive ? 'bg-primary-50/50' : ''}`}
            onDragOver={handleRootDragOver}
            onDragLeave={() => setRootDropActive(false)}
            onDrop={handleRootDrop}
          >
            <p className="px-2 py-1.5 text-[10px] font-medium text-surface-400 uppercase tracking-wider">
              {t.sidebar.sessions}
            </p>

            {normalizedSearchQuery ? (
              <div className="space-y-0.5">
                {filteredFolders.map(folder => (
                  <div
                    key={folder.id}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-surface-600 hover:bg-surface-50"
                  >
                    <Folder size={14} className="shrink-0" />
                    <span className="text-sm flex-1 min-w-0 truncate" title={folder.name}>{folder.name}</span>
                    <button
                      onClick={(e) => handleCreateSessionInFolder(e, folder.id)}
                      className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all"
                      title={t.sidebar.newSession}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                ))}
                {filteredSessions.map(renderSessionRow)}
                {filteredPersistedSessions.map(ps => (
                  <div
                    key={ps.id}
                    onClick={() => loadPersistedSession(ps.id)}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-100 hover:bg-surface-50 text-surface-500"
                  >
                    <Clock size={14} className="shrink-0 opacity-40" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" title={ps.name || t.sidebar.untitled}>{ps.name || t.sidebar.untitled}</p>
                      <p className="text-[10px] text-surface-400 mt-0.5">
                        {formatTime(ps.updated_at || ps.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeletePersistedSession(e, ps.id)}
                      className="hidden group-hover:inline-flex p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all"
                      title={t.common.delete}
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await loadPersistedSession(ps.id)
                        setHistoryTreeOpen(true)
                      }}
                      className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all"
                      title={t.tooltips.historyTree}
                    >
                      <GitBranch size={12} />
                    </button>
                  </div>
                ))}
                {filteredFolders.length === 0 && filteredSessions.length === 0 && filteredPersistedSessions.length === 0 && (
                  <p className="px-3 py-6 text-xs text-surface-400 text-center">{t.sidebar.noSessions}</p>
                )}
              </div>
            ) : sessions.length === 0 && persistedOnlySessions.length === 0 && rootFolders.length === 0 ? (
              <p className="px-3 py-6 text-xs text-surface-400 text-center">
                {t.sidebar.noSessions}
              </p>
            ) : (
              <div className="space-y-0.5">
                {rootFolders.map(folder => renderFolder(folder.id))}
                {[...rootSessions].reverse().map(renderSessionRow)}
                {persistedOnlySessions.map(ps => (
                  <div
                    key={ps.id}
                    onClick={() => loadPersistedSession(ps.id)}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-100 hover:bg-surface-50 text-surface-500"
                  >
                    <Clock size={14} className="shrink-0 opacity-40" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" title={ps.name || t.sidebar.untitled}>{ps.name || t.sidebar.untitled}</p>
                      <p className="text-[10px] text-surface-400 mt-0.5">
                        {formatTime(ps.updated_at || ps.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeletePersistedSession(e, ps.id)}
                      className="hidden group-hover:inline-flex p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all"
                      title={t.common.delete}
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await loadPersistedSession(ps.id)
                        setHistoryTreeOpen(true)
                      }}
                      className="hidden group-hover:inline-flex p-1 hover:text-primary-600 rounded transition-all"
                      title={t.tooltips.historyTree}
                    >
                      <GitBranch size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="border-t border-surface-100 dark:border-surface-700 p-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenHelp}
                className="btn-ghost"
              >
                <CircleHelp size={16} />
                <span className="text-xs">{t.sidebar.help}</span>
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="btn-ghost"
              >
                <Settings size={16} />
                <span className="text-xs">{t.sidebar.settings}</span>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const newTheme = settings.theme === 'dark' ? 'light' : 'dark'
                  document.documentElement.classList.toggle('dark', newTheme === 'dark')
                  updateSettings({ ...settings, theme: newTheme })
                }}
                className="btn-ghost p-1.5"
                title={settings.theme === 'dark' ? t.settings.themeLight : t.settings.themeDark}
              >
                {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <LanguageToggle />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
