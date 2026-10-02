import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import { BookOpen, Plus, Search, X, Edit3, Check, Trash2 } from 'lucide-react'

interface ProTermEntry {
  id: string
  term: string
  definition: string
  created_at: number
}

type ProTerminologyApi = {
  getProTerminology?: () => Promise<ProTermEntry[]>
  addProTerm?: (term: string, definition: string) => Promise<ProTermEntry>
  updateProTerm?: (id: string, term: string, definition: string) => Promise<void>
  deleteProTerm?: (id: string) => Promise<void>
  searchProTerms?: (query: string) => Promise<ProTermEntry[]>
}

interface FolderTermEntry {
  id: string
  folder_id: string
  term: string
  definition: string
  created_at: number
}

type FolderTerminologyApi = {
  getFolderTerminology?: (folderId: string) => Promise<FolderTermEntry[]>
  addFolderTerm?: (folderId: string, term: string, definition: string) => Promise<FolderTermEntry>
  updateFolderTerm?: (id: string, term: string, definition: string) => Promise<void>
  deleteFolderTerm?: (id: string) => Promise<void>
  searchFolderTerms?: (folderId: string, query: string) => Promise<FolderTermEntry[]>
}

type TerminologyApi = ProTerminologyApi & FolderTerminologyApi

interface TermListItem {
  id: string
  term: string
  definition: string
}

interface TermListProps {
  terms: TermListItem[]
  editingId: string | null
  editTerm: string
  editDefinition: string
  onStartEdit: (term: TermListItem) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  setEditTerm: (value: string) => void
  setEditDefinition: (value: string) => void
  emptyText: string
}

function TermList({
  terms,
  editingId,
  editTerm,
  editDefinition,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  setEditTerm,
  setEditDefinition,
  emptyText
}: TermListProps) {
  if (terms.length === 0) {
    return <p className="text-[11px] text-surface-400 py-2 text-center">{emptyText}</p>
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {terms.map(term => (
        <div key={term.id} className="group flex items-start gap-1.5 py-1.5 px-1.5 rounded hover:bg-surface-50">
          {editingId === term.id ? (
            <div className="flex-1 space-y-1">
              <input
                value={editTerm}
                onChange={(e) => setEditTerm(e.target.value)}
                className="input-field text-xs py-1 w-full"
                autoFocus
              />
              <input
                value={editDefinition}
                onChange={(e) => setEditDefinition(e.target.value)}
                className="input-field text-xs py-1 w-full"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit(term.id)
                  if (e.key === 'Escape') onCancelEdit()
                }}
              />
              <div className="flex gap-1">
                <button onClick={onCancelEdit} className="btn-ghost p-1">
                  <X size={11} />
                </button>
                <button onClick={() => onSaveEdit(term.id)} className="btn-ghost p-1">
                  <Check size={11} className="text-green-600" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-surface-800 block">{term.term}</span>
                {term.definition && (
                  <span className="text-[11px] text-surface-500 block truncate">{term.definition}</span>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-all">
                <button onClick={() => onStartEdit(term)} className="p-0.5 hover:text-primary-600">
                  <Edit3 size={11} />
                </button>
                <button onClick={() => onDelete(term.id)} className="p-0.5 hover:text-red-500">
                  <Trash2 size={11} />
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function getRootFolderId(
  folderId: string | null | undefined,
  folders: Array<{ id: string; parentId: string | null }>
): string | null {
  if (!folderId) return null
  const folderMap = new Map(folders.map(folder => [folder.id, folder.parentId]))
  const visited = new Set<string>()
  let currentId: string | null = folderId

  while (currentId) {
    if (visited.has(currentId)) return currentId
    visited.add(currentId)

    const parentId = folderMap.get(currentId)
    if (parentId === undefined || parentId === null) return currentId
    currentId = parentId
  }

  return null
}

export default function TerminologyPanel() {
  const { t } = useI18n()
  const folders = useAppStore(s => s.folders)
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })
  const { showToast } = useAppStore()
  const terminologyApi = window.api as unknown as TerminologyApi | undefined

  const [activeTab, setActiveTab] = useState<'pro' | 'folder'>('pro')
  const rootFolderId = getRootFolderId(session?.folderId ?? null, folders)

  const [proTerms, setProTerms] = useState<ProTermEntry[]>([])
  const [proSearchQuery, setProSearchQuery] = useState('')
  const [proNewTerm, setProNewTerm] = useState('')
  const [proNewDefinition, setProNewDefinition] = useState('')
  const [proEditingId, setProEditingId] = useState<string | null>(null)
  const [proEditTerm, setProEditTerm] = useState('')
  const [proEditDefinition, setProEditDefinition] = useState('')
  const [proShowAddForm, setProShowAddForm] = useState(false)

  const [folderTerms, setFolderTerms] = useState<FolderTermEntry[]>([])
  const [folderSearchQuery, setFolderSearchQuery] = useState('')
  const [folderNewTerm, setFolderNewTerm] = useState('')
  const [folderNewDefinition, setFolderNewDefinition] = useState('')
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null)
  const [folderEditTerm, setFolderEditTerm] = useState('')
  const [folderEditDefinition, setFolderEditDefinition] = useState('')
  const [folderShowAddForm, setFolderShowAddForm] = useState(false)

  const loadProTerms = useCallback(async () => {
    try {
      if (proSearchQuery.trim()) {
        const results = await terminologyApi?.searchProTerms?.(proSearchQuery)
        setProTerms(results || [])
      } else {
        const results = await terminologyApi?.getProTerminology?.()
        setProTerms(results || [])
      }
    } catch (error) {
      console.error('Failed to load professional terminology:', error)
    }
  }, [terminologyApi, proSearchQuery])

  const loadFolderTerms = useCallback(async () => {
    if (!rootFolderId) {
      setFolderTerms([])
      return
    }

    try {
      if (folderSearchQuery.trim()) {
        const results = await terminologyApi?.searchFolderTerms?.(rootFolderId, folderSearchQuery)
        setFolderTerms(results || [])
      } else {
        const results = await terminologyApi?.getFolderTerminology?.(rootFolderId)
        setFolderTerms(results || [])
      }
    } catch (error) {
      console.error('Failed to load folder terminology:', error)
    }
  }, [terminologyApi, rootFolderId, folderSearchQuery])

  useEffect(() => {
    loadProTerms()
  }, [loadProTerms])

  useEffect(() => {
    loadFolderTerms()
  }, [loadFolderTerms])

  useEffect(() => {
    if (!rootFolderId && activeTab === 'folder') {
      setActiveTab('pro')
      setFolderShowAddForm(false)
    }
  }, [rootFolderId, activeTab])

  const handleAddProTerm = async () => {
    if (!proNewTerm.trim()) return
    try {
      await terminologyApi?.addProTerm?.(proNewTerm.trim(), proNewDefinition.trim())
      setProNewTerm('')
      setProNewDefinition('')
      setProShowAddForm(false)
      loadProTerms()
      showToast(t.terminology.imported, 'success')
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleUpdateProTerm = async (id: string) => {
    if (!proEditTerm.trim()) return
    try {
      await terminologyApi?.updateProTerm?.(id, proEditTerm.trim(), proEditDefinition.trim())
      setProEditingId(null)
      loadProTerms()
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleDeleteProTerm = async (id: string) => {
    try {
      await terminologyApi?.deleteProTerm?.(id)
      loadProTerms()
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleStartProEdit = (term: TermListItem) => {
    setProEditingId(term.id)
    setProEditTerm(term.term)
    setProEditDefinition(term.definition)
  }

  const handleAddFolderTerm = async () => {
    if (!rootFolderId || !folderNewTerm.trim()) return
    try {
      await terminologyApi?.addFolderTerm?.(rootFolderId, folderNewTerm.trim(), folderNewDefinition.trim())
      setFolderNewTerm('')
      setFolderNewDefinition('')
      setFolderShowAddForm(false)
      loadFolderTerms()
      showToast(t.terminology.imported, 'success')
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleUpdateFolderTerm = async (id: string) => {
    if (!folderEditTerm.trim()) return
    try {
      await terminologyApi?.updateFolderTerm?.(id, folderEditTerm.trim(), folderEditDefinition.trim())
      setFolderEditingId(null)
      loadFolderTerms()
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleDeleteFolderTerm = async (id: string) => {
    try {
      await terminologyApi?.deleteFolderTerm?.(id)
      loadFolderTerms()
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleStartFolderEdit = (term: TermListItem) => {
    setFolderEditingId(term.id)
    setFolderEditTerm(term.term)
    setFolderEditDefinition(term.definition)
  }

  const isProTab = activeTab === 'pro'
  const showAddForm = isProTab ? proShowAddForm : folderShowAddForm

  if (!session) return null

  return (
    <div className="card p-3 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-surface-700 flex items-center gap-1.5">
          <BookOpen size={13} className="text-primary-600" />
          {`${t.terminology.title} · ${isProTab ? '专业术语库' : '本文术语库'}`}
        </h3>
        <button
          onClick={() => {
            if (isProTab) {
              setProShowAddForm(!proShowAddForm)
            } else {
              setFolderShowAddForm(!folderShowAddForm)
            }
          }}
          disabled={!isProTab && !rootFolderId}
          className="btn-ghost text-xs text-primary-600 hover:text-primary-700 p-1"
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex gap-1 mb-2">
        <button
          onClick={() => setActiveTab('pro')}
          className={`text-[11px] px-2 py-1 rounded ${activeTab === 'pro' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-surface-500 hover:bg-surface-100'}`}
        >
          专业术语库
        </button>
        <button
          onClick={() => setActiveTab('folder')}
          disabled={!rootFolderId}
          className={`text-[11px] px-2 py-1 rounded ${activeTab === 'folder' ? 'bg-primary-100 text-primary-700 font-medium' : 'text-surface-500 hover:bg-surface-100'} ${!rootFolderId ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          本文术语库
        </button>
      </div>

      <div className="relative mb-2">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
        <input
          value={isProTab ? proSearchQuery : folderSearchQuery}
          onChange={(e) => {
            if (isProTab) {
              setProSearchQuery(e.target.value)
            } else {
              setFolderSearchQuery(e.target.value)
            }
          }}
          placeholder={t.terminology.search}
          className="input-field text-xs py-1.5 pl-7 w-full"
        />
      </div>

      {showAddForm && (
        <div className="mb-2 p-2 bg-surface-50 rounded-md space-y-1.5 border border-surface-200">
          <input
            value={isProTab ? proNewTerm : folderNewTerm}
            onChange={(e) => {
              if (isProTab) {
                setProNewTerm(e.target.value)
              } else {
                setFolderNewTerm(e.target.value)
              }
            }}
            placeholder={t.terminology.termPlaceholder}
            className="input-field text-xs py-1.5 w-full"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (isProTab) {
                  handleAddProTerm()
                } else {
                  handleAddFolderTerm()
                }
              }
              if (e.key === 'Escape') {
                if (isProTab) {
                  setProShowAddForm(false)
                } else {
                  setFolderShowAddForm(false)
                }
              }
            }}
          />
          <input
            value={isProTab ? proNewDefinition : folderNewDefinition}
            onChange={(e) => {
              if (isProTab) {
                setProNewDefinition(e.target.value)
              } else {
                setFolderNewDefinition(e.target.value)
              }
            }}
            placeholder={t.terminology.definitionPlaceholder}
            className="input-field text-xs py-1.5 w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (isProTab) {
                  handleAddProTerm()
                } else {
                  handleAddFolderTerm()
                }
              }
            }}
          />
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => {
                if (isProTab) {
                  setProShowAddForm(false)
                } else {
                  setFolderShowAddForm(false)
                }
              }}
              className="btn-ghost text-xs py-1 px-2"
            >
              <X size={11} />
            </button>
            <button
              onClick={isProTab ? handleAddProTerm : handleAddFolderTerm}
              disabled={isProTab ? !proNewTerm.trim() : !folderNewTerm.trim()}
              className="btn-primary text-xs py-1 px-2"
            >
              <Check size={11} />
              {t.terminology.add}
            </button>
          </div>
        </div>
      )}

      {isProTab ? (
        <TermList
          terms={proTerms}
          editingId={proEditingId}
          editTerm={proEditTerm}
          editDefinition={proEditDefinition}
          onStartEdit={handleStartProEdit}
          onSaveEdit={handleUpdateProTerm}
          onCancelEdit={() => setProEditingId(null)}
          onDelete={handleDeleteProTerm}
          setEditTerm={setProEditTerm}
          setEditDefinition={setProEditDefinition}
          emptyText={t.terminology.empty}
        />
      ) : (
        <TermList
          terms={folderTerms}
          editingId={folderEditingId}
          editTerm={folderEditTerm}
          editDefinition={folderEditDefinition}
          onStartEdit={handleStartFolderEdit}
          onSaveEdit={handleUpdateFolderTerm}
          onCancelEdit={() => setFolderEditingId(null)}
          onDelete={handleDeleteFolderTerm}
          setEditTerm={setFolderEditTerm}
          setEditDefinition={setFolderEditDefinition}
          emptyText={rootFolderId ? t.terminology.empty : '请选择文件夹内会话以管理本文术语库'}
        />
      )}
    </div>
  )
}
