import React, { useState } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import { ArrowRight, BookOpen, ListChecks, Sparkles, X } from 'lucide-react'
import type { PolishSession } from '../types'

interface FlowTransitionModalProps {
  open: boolean
  onClose: () => void
}

export default function FlowTransitionModal({ open, onClose }: FlowTransitionModalProps) {
  const { t } = useI18n()
  const { createSession, getActiveSession } = useAppStore()

  const [carryTerms, setCarryTerms] = useState(true)
  const [carryKeyPoints, setCarryKeyPoints] = useState(true)
  const [generateDraft, setGenerateDraft] = useState(false)
  const [nextRequirements, setNextRequirements] = useState('')

  if (!open) return null

  const currentSession = getActiveSession()
  if (!currentSession) return null

  const handleProceed = () => {
    // Create new session
    const newId = createSession()

    // Get new session and carry over data
    const store = useAppStore.getState()
    const newSession = store.sessions.find(s => s.id === newId)
    if (!newSession) return

    const updates: Partial<PolishSession> = {}

    if (carryTerms && currentSession.documentId) {
      updates.documentId = currentSession.documentId
      updates.terminologyHighlight = currentSession.terminologyHighlight
    }

    if (carryKeyPoints) {
      updates.keyPoints = currentSession.keyPoints.map(kp => ({
        ...kp,
        id: `kp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }))
    }

    if (generateDraft && currentSession.outputText) {
      let inputContent = currentSession.outputText
      if (nextRequirements.trim()) {
        inputContent += '\n\n---\n下一段写作需求:\n' + nextRequirements.trim()
      }
      updates.inputText = inputContent
    }

    store.updateActiveSession(updates)
    onClose()
  }

  const toggleOptions = [
    {
      key: 'terms',
      checked: carryTerms,
      onChange: () => setCarryTerms(!carryTerms),
      icon: BookOpen,
      label: t.flowTransition.carryTerms
    },
    {
      key: 'keyPoints',
      checked: carryKeyPoints,
      onChange: () => setCarryKeyPoints(!carryKeyPoints),
      icon: ListChecks,
      label: t.flowTransition.carryKeyPoints
    },
    {
      key: 'draft',
      checked: generateDraft,
      onChange: () => setGenerateDraft(!generateDraft),
      icon: Sparkles,
      label: t.flowTransition.generateDraft
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-slide-up border border-surface-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900">{t.flowTransition.title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-100 rounded-full transition-colors">
            <X size={18} className="text-surface-500" />
          </button>
        </div>

        <p className="text-sm text-surface-600 mb-5">{t.flowTransition.message}</p>

        {/* Options */}
        <div className="space-y-2 mb-6">
          {toggleOptions.map(opt => {
            const Icon = opt.icon
            return (
              <label
                key={opt.key}
                className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:bg-surface-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={opt.onChange}
                  className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                />
                <Icon size={16} className="text-surface-500 shrink-0" />
                <span className="text-sm text-surface-700">{opt.label}</span>
              </label>
            )
          })}
        </div>

        {/* Next paragraph requirements */}
        <div className="mb-4">
          <label className="text-xs font-medium text-surface-600 mb-1.5 block">
            {t.flowTransition.nextRequirements}
          </label>
          <textarea
            value={nextRequirements}
            onChange={(e) => setNextRequirements(e.target.value)}
            placeholder={t.flowTransition.nextRequirementsPlaceholder}
            rows={3}
            className="textarea-field text-xs w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center py-2.5">
            {t.flowTransition.stay}
          </button>
          <button onClick={handleProceed} className="btn-primary flex-1 justify-center py-2.5">
            <ArrowRight size={16} />
            {t.flowTransition.proceed}
          </button>
        </div>
      </div>
    </div>
  )
}
