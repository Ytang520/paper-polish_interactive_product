import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import HelpTooltip from './HelpTooltip'
import { Copy, Trash2, ArrowRight, Download, FileText, Code } from 'lucide-react'
import type { TermEntry } from '../types'

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-primary-300 active:bg-primary-400 transition-colors bg-surface-200 dark:bg-surface-700"
      onMouseDown={onMouseDown}
    />
  )
}

export default function EditorPanel() {
  const { t } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const editorContentRef = useRef<HTMLDivElement>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [inputWidthPercent, setInputWidthPercent] = useState(50)
  const inputWidthPercentRef = useRef(inputWidthPercent)
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })
  const { updateActiveSession, showToast } = useAppStore()

  // Auto-resize textarea
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    autoResize(inputRef.current)
  }, [session?.inputText, autoResize])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    inputWidthPercentRef.current = inputWidthPercent
  }, [inputWidthPercent])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startPercent = inputWidthPercentRef.current
    const editorWidth = editorContentRef.current?.clientWidth || 1
    const minPercent = 25
    const maxPercent = 75

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const deltaPercent = (delta / editorWidth) * 100
      const nextPercent = Math.max(minPercent, Math.min(maxPercent, startPercent + deltaPercent))
      setInputWidthPercent(nextPercent)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <ArrowRight size={24} className="text-surface-400" />
          </div>
          <p className="text-surface-500 text-sm">
            {t.sidebar.noSessions}
          </p>
          <p className="text-surface-400 text-xs mt-1">
            {t.sidebar.newSession}
          </p>
        </div>
      </div>
    )
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateActiveSession({ inputText: e.target.value })
    autoResize(e.target)
  }

  const handleCopyOutput = async () => {
    if (session.outputText) {
      await navigator.clipboard.writeText(session.outputText)
      showToast(t.editor.copySuccess, 'success')
    }
  }

  const handleUseAsInput = () => {
    if (session.outputText) {
      updateActiveSession({ inputText: session.outputText, outputText: '' })
    }
  }

  const handleClearInput = () => {
    updateActiveSession({ inputText: '' })
  }

  const handleExport = async (format: 'json' | 'markdown') => {
    const api = window.api as (typeof window.api & {
      exportFile: (content: string, defaultName: string, format: 'json' | 'markdown') => Promise<boolean>
    }) | undefined
    if (!session || !api) return
    setShowExportMenu(false)

    const sessionName = session.name || 'untitled'

    if (format === 'json') {
      const exportData = {
        session: {
          id: session.id,
          name: session.name,
          createdAt: session.createdAt,
          scope: session.scope,
          mode: session.mode
        },
        inputText: session.inputText,
        outputText: session.outputText,
        keyPoints: session.keyPoints,
        history: session.history,
        ultraIterations: session.ultraIterations
      }
      const content = JSON.stringify(exportData, null, 2)
      await api.exportFile(content, `${sessionName}.json`, 'json')
    } else {
      let md = `# ${sessionName}\n\n`
      md += `**Scope**: ${session.scope} | **Mode**: ${session.mode}\n`
      md += `**Created**: ${new Date(session.createdAt).toLocaleString()}\n\n`
      md += `## Input\n\n${session.inputText}\n\n`
      md += `## Output\n\n${session.outputText}\n\n`
      if (session.keyPoints.length > 0) {
        md += '## Key Points\n\n'
        session.keyPoints.forEach(kp => {
          md += `- [${kp.checked ? 'x' : ' '}] ${kp.text}\n`
        })
        md += '\n'
      }
      if (session.history.length > 0) {
        md += '## Polish History\n\n'
        session.history.forEach((node, i) => {
          md += `### Round ${i + 1} (${new Date(node.timestamp).toLocaleString()})\n\n`
          md += `${node.text}\n\n`
        })
      }
      await api.exportFile(md, `${sessionName}.md`, 'markdown')
    }
    showToast(t.editor.exportSuccess, 'success')
  }

  return (
    <div ref={editorContentRef} className="flex-1 flex p-4 overflow-hidden min-w-0">
      {/* Input panel */}
      <div className="shrink-0 flex flex-col min-w-0 card overflow-hidden" style={{ width: `${inputWidthPercent}%` }} data-nav-section="input">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{t.editor.inputLabel}</span>
            <span className="text-[10px] text-surface-400">
              {session.inputText.length} {t.editor.charCount}
            </span>
          </div>
          <button
            onClick={handleClearInput}
            className="btn-ghost text-surface-400"
            disabled={!session.inputText}
          >
            <Trash2 size={13} />
            <span className="text-xs">{t.editor.clear}</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            ref={inputRef}
            value={session.inputText}
            onChange={handleInputChange}
            placeholder={t.editor.inputPlaceholder}
            className="w-full min-h-[200px] bg-transparent text-surface-800 dark:text-surface-100 text-sm leading-relaxed
                       placeholder:text-surface-400 focus:outline-none resize-none"
          />
        </div>
      </div>

      <ResizeHandle onMouseDown={handleResizeStart} />

      {/* Output panel */}
      <div className="shrink-0 flex flex-col min-w-0 card overflow-hidden" style={{ width: `${100 - inputWidthPercent}%` }} data-nav-section="output">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-surface-700">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-surface-700 dark:text-surface-300">{t.editor.outputLabel}</span>
            <span className="text-[10px] text-surface-400">
              {session.outputText.length} {t.editor.charCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="btn-ghost text-surface-400"
                disabled={!session.outputText}
                title={t.tooltips.exportBtn}
              >
                <Download size={13} />
                <span className="text-xs">{t.editor.export}</span>
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-10 py-1 w-40">
                  <button
                    onClick={() => handleExport('markdown')}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700 flex items-center gap-2 text-surface-700 dark:text-surface-300"
                  >
                    <FileText size={12} /> Markdown (.md)
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-700 flex items-center gap-2 text-surface-700 dark:text-surface-300"
                  >
                    <Code size={12} /> JSON (.json)
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleUseAsInput}
              className="btn-ghost text-surface-400"
              disabled={!session.outputText}
              title={t.tooltips.useAsInput}
            >
              <ArrowRight size={13} className="rotate-180" />
              <span className="text-xs">{t.editor.useAsInput}</span>
            </button>
            <button
              onClick={handleCopyOutput}
              className="btn-ghost text-surface-400"
              disabled={!session.outputText}
              title={t.tooltips.copyBtn}
            >
              <Copy size={13} />
              <span className="text-xs">{t.editor.copy}</span>
            </button>
          </div>
        </div>
        <OutputContent />
      </div>
    </div>
  )
}

/** Output content component - handles streaming, static text, and terminology highlighting */
function OutputContent() {
  const { t } = useI18n()
  const isPolishing = useAppStore(s => s.isPolishing)
  const streamingContent = useAppStore(s => s.streamingContent)
  const streamingReasoning = useAppStore(s => s.streamingReasoning)
  const outputText = useAppStore(s => {
    const session = s.sessions.find(sess => sess.id === s.activeSessionId)
    return session?.outputText || ''
  })
  const terminologyHighlight = useAppStore(s => {
    const session = s.sessions.find(sess => sess.id === s.activeSessionId)
    return session?.terminologyHighlight || false
  })
  const documentId = useAppStore(s => {
    const session = s.sessions.find(sess => sess.id === s.activeSessionId)
    return session?.documentId || session?.id || ''
  })
  const { updateActiveSession } = useAppStore()

  const [terms, setTerms] = useState<TermEntry[]>([])

  // Load terminology for highlighting
  useEffect(() => {
    if (!terminologyHighlight || !documentId) {
      setTerms([])
      return
    }
    if (!window.api) { setTerms([]); return }
    window.api.getTerminology(documentId).then(setTerms).catch(() => setTerms([]))
  }, [terminologyHighlight, documentId])

  const displayText = isPolishing ? streamingContent : outputText

  // Build highlighted output with term spans
  const highlightedOutput = useMemo(() => {
    if (!terminologyHighlight || terms.length === 0 || !displayText || isPolishing) return null
    // Build a regex that matches any term (case-insensitive)
    const escaped = terms.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
    const parts = displayText.split(regex)
    const termMap = new Map(terms.map(t => [t.term.toLowerCase(), t]))
    return parts.map((part, i) => {
      const matched = termMap.get(part.toLowerCase())
      if (matched) {
        return (
          <span
            key={i}
            className="bg-primary-100 text-primary-800 px-0.5 rounded cursor-help border-b border-dashed border-primary-400"
            title={matched.definition || matched.term}
          >
            {part}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }, [displayText, terms, terminologyHighlight, isPolishing])

  // Editable output when not streaming
  const handleOutputEdit = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateActiveSession({ outputText: e.target.value })
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4">
      {/* Reasoning display (for thinking models) */}
      {isPolishing && streamingReasoning && (
        <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
          <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 mb-1.5">{t.polish.thinking}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed whitespace-pre-wrap">
            {streamingReasoning}
          </p>
        </div>
      )}

      {isPolishing ? (
        <div className="text-sm text-surface-800 dark:text-surface-100 leading-relaxed whitespace-pre-wrap">
          {streamingContent || (
            <span className="text-surface-400 animate-pulse-subtle">
              {streamingReasoning ? t.polish.thinking : t.polish.generating}
            </span>
          )}
          {streamingContent && <span className="streaming-cursor" />}
        </div>
      ) : highlightedOutput ? (
        <div className="text-sm text-surface-800 dark:text-surface-100 leading-relaxed whitespace-pre-wrap">
          {highlightedOutput}
        </div>
      ) : (
        <textarea
          value={outputText}
          onChange={handleOutputEdit}
          placeholder={t.editor.outputPlaceholder}
          className="w-full flex-1 min-h-[200px] bg-transparent text-surface-800 dark:text-surface-100 text-sm leading-relaxed
                     placeholder:text-surface-400 focus:outline-none resize-none"
        />
      )}
    </div>
  )
}
