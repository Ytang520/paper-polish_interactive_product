import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import Sidebar from './Sidebar'
import EditorPanel from './EditorPanel'
import PolishControls from './PolishControls'
import ResultPanel from './ResultPanel'
import TerminologyPanel from './TerminologyPanel'
import ReferenceArticlesPanel from './ReferenceArticlesPanel'
import UltraPanel from './UltraPanel'
import FlowTransitionModal from './FlowTransitionModal'
import PolishHistoryTree from './PolishHistoryTree'
import SettingsModal from './SettingsModal'
import CloseDialog from './CloseDialog'
import HelpModal from './HelpModal'
import HelpTooltip from './HelpTooltip'
import { CheckCircle2, AlertCircle, Info, X, ChevronDown, ChevronUp, GitBranch } from 'lucide-react'

const TOAST_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  success: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle2 },
  error: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', icon: AlertCircle },
  info: { bg: 'bg-primary-50 border-primary-200', text: 'text-primary-700', icon: Info }
}

/** Collapsible section wrapper */
function CollapsibleSection({
  title,
  defaultOpen = true,
  tooltip,
  children
}: {
  title: string
  defaultOpen?: boolean
  tooltip?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1.5 text-[11px] font-semibold text-surface-500 uppercase tracking-wider hover:text-surface-700 transition-colors"
      >
        <span className="flex items-center">
          {title}
          {tooltip && <HelpTooltip text={tooltip} />}
        </span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-primary-300 active:bg-primary-400 transition-colors bg-surface-200"
      onMouseDown={onMouseDown}
    />
  )
}

export default function Layout() {
  const { t } = useI18n()
  const toastMessage = useAppStore(s => s.toastMessage)
  const toastType = useAppStore(s => s.toastType)
  const clearToast = useAppStore(s => s.clearToast)
  const historyTreeOpen = useAppStore(s => s.historyTreeOpen)
  const setHistoryTreeOpen = useAppStore(s => s.setHistoryTreeOpen)
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })

  const flowTransitionOpen = useAppStore(s => s.flowTransitionOpen)
  const setFlowTransitionOpen = useAppStore(s => s.setFlowTransitionOpen)
  const sidebarCollapsed = useAppStore(s => s.sidebarCollapsed)
  const createSession = useAppStore(s => s.createSession)
  const setSettingsOpen = useAppStore(s => s.setSettingsOpen)
  const flushPersistence = useAppStore(s => s.flushPersistence)
  const requestRenameSelectedItem = useAppStore(s => s.requestRenameSelectedItem)

  const [rightPanelWidth, setRightPanelWidth] = useState(288)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const rightPanelWidthRef = useRef(rightPanelWidth)

  useEffect(() => {
    rightPanelWidthRef.current = rightPanelWidth
  }, [rightPanelWidth])

  useEffect(() => {
    const cleanup = window.api?.onBeforeClose?.(() => {
      setCloseDialogOpen(true)
    })

    return () => cleanup?.()
  }, [])

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tagName = target.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true
      if (target.isContentEditable) return true
      return false
    }

    const parseShortcut = (shortcut: string) => {
      const parts = shortcut.toLowerCase().split('+')
      return {
        ctrl: parts.includes('ctrl') || parts.includes('meta'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt'),
        key: parts[parts.length - 1]
      }
    }

    const matchesShortcut = (event: KeyboardEvent, shortcut: string) => {
      const parsed = parseShortcut(shortcut)
      const ctrlOrMeta = event.ctrlKey || event.metaKey
      if (parsed.ctrl !== ctrlOrMeta) return false
      if (parsed.shift !== event.shiftKey) return false
      if (parsed.alt !== event.altKey) return false
      return event.key.toLowerCase() === parsed.key
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Esc: blur current element to enter command mode (Jupyter-like)
      if (event.key === 'Escape') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        return
      }

      const inTypingTarget = isTypingTarget(event.target)
      if (inTypingTarget && !event.altKey) return

      const state = useAppStore.getState()
      const shortcuts = state.settings.shortcuts || {}

      // Continue polish (default: Ctrl+Enter)
      if (shortcuts.continuePolish && matchesShortcut(event, shortcuts.continuePolish)) {
        const active = state.sessions.find(sess => sess.id === state.activeSessionId)
        if (active?.outputText && !state.isPolishing) {
          event.preventDefault()
          window.dispatchEvent(new Event('app:continue-polish'))
        }
        return
      }

      // Start/Stop polish (default: Alt+L)
      if (shortcuts.startStopPolish && matchesShortcut(event, shortcuts.startStopPolish)) {
        event.preventDefault()
        if (state.isPolishing) {
          window.dispatchEvent(new Event('app:stop-polish'))
        } else {
          window.dispatchEvent(new Event('app:start-polish'))
        }
        return
      }

      // Rename (default: F2)
      if (shortcuts.rename && matchesShortcut(event, shortcuts.rename)) {
        event.preventDefault()
        requestRenameSelectedItem()
        return
      }

      // New session (default: Ctrl+N)
      if (shortcuts.newSession && matchesShortcut(event, shortcuts.newSession)) {
        event.preventDefault()
        createSession()
        return
      }

      // Settings (default: Ctrl+,)
      if (shortcuts.settings && matchesShortcut(event, shortcuts.settings)) {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }

      // Command mode navigation: left/right arrows
      if (!inTypingTarget && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        const sections = document.querySelectorAll<HTMLElement>('[data-nav-section]')
        if (sections.length === 0) return

        const sectionList = Array.from(sections)
        const currentIndex = sectionList.findIndex(el => el.classList.contains('nav-focused'))
        let nextIndex: number

        if (currentIndex === -1) {
          nextIndex = event.key === 'ArrowRight' ? 0 : sectionList.length - 1
        } else {
          sectionList[currentIndex]?.classList.remove('nav-focused')
          nextIndex = event.key === 'ArrowRight'
            ? (currentIndex + 1) % sectionList.length
            : (currentIndex - 1 + sectionList.length) % sectionList.length
        }

        sectionList[nextIndex]?.classList.add('nav-focused')
        sectionList[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        return
      }

      // Command mode: Enter activates focused section
      if (!inTypingTarget && event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        const focused = document.querySelector<HTMLElement>('.nav-focused')
        if (focused) {
          event.preventDefault()
          const focusable = focused.querySelector<HTMLElement>('textarea, input, button, [tabindex]')
          if (focusable) focusable.focus()
          focused.classList.remove('nav-focused')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createSession, requestRenameSelectedItem, setSettingsOpen])

  const handleRightPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = rightPanelWidthRef.current
    const minWidth = 240
    const maxWidth = 480

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - delta))
      setRightPanelWidth(nextWidth)
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

  const toastStyle = TOAST_STYLES[toastType] || TOAST_STYLES.info
  const ToastIcon = toastStyle.icon

  return (
    <div className="h-screen flex bg-surface-50 dark:bg-surface-900 overflow-hidden">
      {/* Left: Sidebar */}
      <div className={`shrink-0 transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-64'} overflow-hidden`}>
        <Sidebar onOpenHelp={() => setHelpOpen(true)} />
      </div>

      {/* Right: Main content area */}
      <div className="flex-1 flex min-w-0">
        {/* Editor area (takes most space) */}
        <EditorPanel />

        <ResizeHandle onMouseDown={handleRightPanelResizeStart} />

        {/* Right panel: controls + resources + result */}
        <div
          className="shrink-0 border-l border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 flex flex-col overflow-hidden"
          style={{ width: rightPanelWidth }}
        >
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Polish Controls */}
            <PolishControls />

            {/* Polish Action + Feedback */}
            <div className="border-t border-surface-100 dark:border-surface-700 pt-3">
              <ResultPanel />
            </div>

            {/* Collapsible: Terminology */}
            <div className="border-t border-surface-100 dark:border-surface-700 pt-3">
              <CollapsibleSection title={t.terminology.title} tooltip={t.tooltips.terminology} defaultOpen={false}>
                <TerminologyPanel />
              </CollapsibleSection>
            </div>

            {/* Collapsible: Reference Articles */}
            <div className="border-t border-surface-100 dark:border-surface-700 pt-3">
              <CollapsibleSection title={t.references.title} tooltip={t.tooltips.references} defaultOpen={false}>
                <ReferenceArticlesPanel />
              </CollapsibleSection>
            </div>

            {/* Collapsible: Ultra Mode */}
            <div className="border-t border-surface-100 dark:border-surface-700 pt-3">
              <CollapsibleSection title={t.ultra.title} tooltip={t.tooltips.ultraMode} defaultOpen={false}>
                <UltraPanel />
              </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>

      {/* Settings modal (self-manages visibility) */}
      <SettingsModal />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Flow Transition Modal */}
      <FlowTransitionModal
        open={flowTransitionOpen}
        onClose={() => setFlowTransitionOpen(false)}
      />

      <CloseDialog
        open={closeDialogOpen}
        onCancel={() => {
          setCloseDialogOpen(false)
          window.api?.cancelClose?.()
        }}
        onConfirm={async (saveOptions) => {
          setCloseDialogOpen(false)
          await flushPersistence()
          window.api?.confirmClose?.(saveOptions)
        }}
      />

      {/* History Tree Modal */}
      {historyTreeOpen && session && session.history.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setHistoryTreeOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[70vh] flex flex-col border border-surface-200 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200">
              <h2 className="text-sm font-bold text-surface-800 flex items-center gap-2">
                <GitBranch size={16} className="text-primary-600" />
                {t.editor.polishHistory}
              </h2>
              <button onClick={() => setHistoryTreeOpen(false)} className="p-1 hover:bg-surface-100 rounded-full transition-colors">
                <X size={16} className="text-surface-500" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <PolishHistoryTree />
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in-right">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${toastStyle.bg}`}>
            <ToastIcon size={16} className={toastStyle.text} />
            <span className={`text-sm font-medium ${toastStyle.text}`}>{toastMessage}</span>
            <button
              onClick={clearToast}
              className={`ml-2 p-0.5 rounded hover:bg-black/5 transition-colors ${toastStyle.text}`}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
