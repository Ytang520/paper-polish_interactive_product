import React, { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import type { ReferenceArticle } from '../types'
import { Library, Plus, X, Check, Trash2, Edit3, Zap, ChevronDown, ChevronUp, FileText } from 'lucide-react'

export default function ReferenceArticlesPanel() {
  const { t } = useI18n()
  const { showToast } = useAppStore()

  const [articles, setArticles] = useState<ReferenceArticle[]>([])
  const [embeddedIds, setEmbeddedIds] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Add form state
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newSource, setNewSource] = useState('')

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editSource, setEditSource] = useState('')

  const [embeddingInProgress, setEmbeddingInProgress] = useState<string | null>(null)

  const loadArticles = useCallback(async () => {
    if (!window.api) return
    try {
      const result = await window.api.getReferenceArticles()
      setArticles(result)

      // Check which articles have embeddings
      const embedded = new Set<string>()
      for (const article of result) {
        const embs = await window.api.getArticleEmbeddings(article.id)
        if (embs && (embs as unknown[]).length > 0) {
          embedded.add(article.id)
        }
      }
      setEmbeddedIds(embedded)
    } catch (error) {
      console.error('Failed to load reference articles:', error)
    }
  }, [])

  useEffect(() => {
    loadArticles()
  }, [loadArticles])

  const handleAddArticle = async () => {
    if (!newTitle.trim() || !newContent.trim() || !window.api) return
    try {
      await window.api.addReferenceArticle(newTitle.trim(), newContent.trim(), newSource.trim())
      setNewTitle('')
      setNewContent('')
      setNewSource('')
      setShowAddForm(false)
      loadArticles()
      showToast(t.common.success, 'success')
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleUpdateArticle = async (id: string) => {
    if (!editTitle.trim() || !editContent.trim() || !window.api) return
    try {
      await window.api.updateReferenceArticle(id, editTitle.trim(), editContent.trim(), editSource.trim())
      setEditingId(null)
      loadArticles()
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleDeleteArticle = async (id: string) => {
    if (!window.api) return
    try {
      await window.api.deleteReferenceArticle(id)
      loadArticles()
    } catch (error) {
      showToast(String(error), 'error')
    }
  }

  const handleEmbed = async (articleId: string) => {
    if (!window.api) return
    setEmbeddingInProgress(articleId)
    try {
      await window.api.embedArticle(articleId)
      setEmbeddedIds(prev => new Set([...prev, articleId]))
      showToast(t.references.embedded, 'success')
    } catch (error) {
      showToast(String(error), 'error')
    } finally {
      setEmbeddingInProgress(null)
    }
  }

  const handleEmbedAll = async () => {
    for (const article of articles) {
      if (!embeddedIds.has(article.id)) {
        await handleEmbed(article.id)
      }
    }
  }

  const handleStartEdit = (article: ReferenceArticle) => {
    setEditingId(article.id)
    setEditTitle(article.title)
    setEditContent(article.content)
    setEditSource(article.source)
    setExpandedId(article.id)
  }

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-surface-700 flex items-center gap-1.5">
          <Library size={13} className="text-primary-600" />
          {t.references.title}
        </h3>
        <div className="flex items-center gap-1">
          {articles.some(a => !embeddedIds.has(a.id)) && (
            <button
              onClick={handleEmbedAll}
              disabled={embeddingInProgress !== null}
              className="btn-ghost text-[10px] text-amber-600 hover:text-amber-700 p-1"
              title={t.references.embedAll}
            >
              <Zap size={11} />
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-ghost text-xs text-primary-600 hover:text-primary-700 p-1"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="mb-2 p-2 bg-surface-50 rounded-md space-y-1.5 border border-surface-200">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t.references.titlePlaceholder}
            className="input-field text-xs py-1.5 w-full"
            autoFocus
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={t.references.contentPlaceholder}
            className="input-field text-xs py-1.5 w-full resize-y"
            rows={4}
          />
          <input
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder={t.references.sourcePlaceholder}
            className="input-field text-xs py-1.5 w-full"
          />
          <div className="flex gap-1 justify-end">
            <button onClick={() => setShowAddForm(false)} className="btn-ghost text-xs py-1 px-2">
              <X size={11} />
            </button>
            <button
              onClick={handleAddArticle}
              disabled={!newTitle.trim() || !newContent.trim()}
              className="btn-primary text-xs py-1 px-2"
            >
              <Check size={11} />
              {t.references.add}
            </button>
          </div>
        </div>
      )}

      {/* Articles List */}
      {articles.length === 0 ? (
        <p className="text-[11px] text-surface-400 py-2 text-center">{t.references.empty}</p>
      ) : (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {articles.map(article => (
            <div key={article.id} className="border border-surface-200 rounded-md overflow-hidden">
              {/* Article header */}
              <div
                className="flex items-center gap-2 px-2 py-1.5 bg-surface-50 cursor-pointer hover:bg-surface-100 transition-colors"
                onClick={() => setExpandedId(expandedId === article.id ? null : article.id)}
              >
                <FileText size={12} className="text-surface-400 shrink-0" />
                <span className="text-xs font-medium text-surface-700 flex-1 truncate">{article.title}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Embedding status */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                    embeddedIds.has(article.id)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-surface-200 text-surface-500'
                  }`}>
                    {embeddedIds.has(article.id) ? t.references.embedded : t.references.notEmbedded}
                  </span>
                  {expandedId === article.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </div>
              </div>

              {/* Expanded content */}
              {expandedId === article.id && (
                <div className="p-2 space-y-2 border-t border-surface-200">
                  {editingId === article.id ? (
                    <>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="input-field text-xs py-1 w-full"
                      />
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="input-field text-xs py-1 w-full resize-y"
                        rows={4}
                      />
                      <input
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        className="input-field text-xs py-1 w-full"
                        placeholder={t.references.sourcePlaceholder}
                      />
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditingId(null)} className="btn-ghost p-1">
                          <X size={11} />
                        </button>
                        <button onClick={() => handleUpdateArticle(article.id)} className="btn-ghost p-1">
                          <Check size={11} className="text-green-600" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-surface-600 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                        {article.content}
                      </p>
                      {article.source && (
                        <p className="text-[10px] text-surface-400">
                          {t.references.sourceLabel}: {article.source}
                        </p>
                      )}
                      <p className="text-[10px] text-surface-400">
                        {article.content.length} {t.references.charCount}
                      </p>
                      <div className="flex gap-1 justify-end">
                        {!embeddedIds.has(article.id) && (
                          <button
                            onClick={() => handleEmbed(article.id)}
                            disabled={embeddingInProgress === article.id}
                            className="btn-ghost text-[10px] p-1 text-amber-600"
                          >
                            <Zap size={11} />
                            {embeddingInProgress === article.id ? t.common.loading : t.references.embed}
                          </button>
                        )}
                        <button onClick={() => handleStartEdit(article)} className="btn-ghost p-1">
                          <Edit3 size={11} />
                        </button>
                        <button onClick={() => handleDeleteArticle(article.id)} className="btn-ghost p-1 hover:text-red-500">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
