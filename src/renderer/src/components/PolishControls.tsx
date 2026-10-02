import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import { Type, AlignLeft, FileText, Wand2, PenLine, Settings, ChevronDown, Check, Cpu, Zap, Lightbulb } from 'lucide-react'
import { MODEL_PRESETS, getPresetModelsForModule } from '../types'
import type { PolishScope, PolishMode, ModuleKey } from '../types'

const SCOPE_OPTIONS: { value: PolishScope; icon: React.ElementType; labelKey: 'word' | 'sentence' | 'paragraph' }[] = [
  { value: 'word', icon: Type, labelKey: 'word' },
  { value: 'sentence', icon: AlignLeft, labelKey: 'sentence' },
  { value: 'paragraph', icon: FileText, labelKey: 'paragraph' }
]

const MODE_OPTIONS: { value: PolishMode; icon: React.ElementType; labelKey: 'refinement' | 'generation'; descKey: 'refinementDesc' | 'generationDesc' }[] = [
  { value: 'refinement', icon: PenLine, labelKey: 'refinement', descKey: 'refinementDesc' },
  { value: 'generation', icon: Wand2, labelKey: 'generation', descKey: 'generationDesc' }
]

export default function PolishControls() {
  const { t } = useI18n()
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })
  const { setPolishScope, setPolishMode, settings, updateModuleModel, setSettingsOpen, autoExtractEnabled, autoRecommendTerms, setAutoExtractEnabled, setAutoRecommendTerms } = useAppStore()
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [customModelName, setCustomModelName] = useState('')
  const modelDropdownRef = useRef<HTMLDivElement | null>(null)

  const getModuleKey = useCallback((): ModuleKey => {
    if (!session) return 'paragraph_refinement'
    if (session.scope === 'word') return 'word_refinement'
    if (session.scope === 'sentence') return 'sentence_refinement'
    if (session.mode === 'generation') return 'paragraph_generation'
    return 'paragraph_refinement'
  }, [session?.mode, session?.scope])

  const currentModuleKey = getModuleKey()
  const currentModuleConfig = settings.modules[currentModuleKey]
  const currentModelName = currentModuleConfig.model_name

  const presetModels = useMemo(() => {
    const preset = MODEL_PRESETS.find(item => item.baseUrl === currentModuleConfig.base_url)
    return getPresetModelsForModule(preset, currentModuleKey)
  }, [currentModuleConfig.base_url, currentModuleKey])

  const modelOptions = useMemo(() => {
    const options = [currentModelName, ...presetModels]
    return Array.from(new Set(options))
  }, [currentModelName, presetModels])

  useEffect(() => {
    if (!modelDropdownOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [modelDropdownOpen])

  useEffect(() => {
    if (session && session.scope !== 'paragraph' && session.mode !== 'refinement') {
      setPolishMode('refinement')
    }
  }, [session?.scope])

  const handleSelectModel = useCallback(async (modelName: string) => {
    const nextModel = modelName.trim()
    if (!nextModel || nextModel === currentModelName) {
      setModelDropdownOpen(false)
      return
    }

    await updateModuleModel(currentModuleKey, nextModel)
    setModelDropdownOpen(false)
    setCustomModelName('')
  }, [currentModuleKey, currentModelName, updateModuleModel])

  if (!session) return null

  return (
    <div className="space-y-4" data-nav-section="controls">
      {/* Scope selector */}
      <div>
        <label className="text-xs font-medium text-surface-500 mb-2 block">
          {t.polish.scope}
        </label>
        <div className="flex gap-1.5">
          {SCOPE_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isActive = session.scope === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setPolishScope(opt.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                <Icon size={14} />
                {t.polish[opt.labelKey]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Mode selector */}

      <div>
        <label className="text-xs font-medium text-surface-500 mb-2 block">
          {t.polish.mode}
        </label>
        <div className="flex gap-2">
          {MODE_OPTIONS
            .filter(opt => session.scope === 'paragraph' ? true : opt.value === 'refinement')
            .map(opt => {
              const Icon = opt.icon
              const isActive = session.mode === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setPolishMode(opt.value)}
                  className={`flex-1 p-3 rounded-lg border text-left transition-all duration-150 ${
                    isActive
                      ? 'border-primary-300 bg-primary-50 shadow-sm'
                      : 'border-surface-200 bg-white hover:border-surface-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={14} className={isActive ? 'text-primary-600' : 'text-surface-500'} />
                    <span className={`text-sm font-medium ${isActive ? 'text-primary-700' : 'text-surface-700'}`}>
                      {t.polish[opt.labelKey]}
                    </span>
                  </div>
                  <p className="text-[11px] text-surface-400 leading-snug">
                    {t.polish[opt.descKey]}
                  </p>
                </button>
              )
            })}
        </div>
      </div>

      <div className="relative" ref={modelDropdownRef}>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-surface-500">{t.polish.model}</label>
          <button
            onClick={() => setSettingsOpen(true)}
            className="btn-ghost px-1.5 py-1 text-surface-500 hover:text-surface-700"
            title="Open model settings"
          >
            <Settings size={13} />
          </button>
        </div>

        <button
          onClick={() => setModelDropdownOpen(open => !open)}
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-xs text-surface-700 hover:border-surface-300 transition-colors"
        >
          <span className="min-w-0 flex items-center gap-1.5">
            <Cpu size={13} className="text-surface-500 shrink-0" />
            <span className="truncate rounded-md bg-surface-100 px-2 py-1 text-[11px] font-medium text-surface-700">
              {currentModelName}
            </span>
          </span>
          <ChevronDown size={13} className={`shrink-0 text-surface-500 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {modelDropdownOpen && (
          <div className="absolute z-20 mt-1.5 w-full rounded-lg border border-surface-200 bg-white p-1.5 shadow-lg">
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {modelOptions.map(model => {
                const isActive = model === currentModelName
                return (
                  <button
                    key={model}
                    onClick={() => {
                      void handleSelectModel(model)
                    }}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-100 transition-colors"
                  >
                    <span className="w-3.5 shrink-0 text-primary-600">
                      {isActive ? <Check size={12} /> : null}
                    </span>
                    <span className={`${isActive ? 'text-primary-700 font-medium' : 'text-surface-700'} truncate`}>
                      {model}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-1.5 border-t border-surface-100 pt-1.5">
              <input
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                placeholder={t.polish.customModelPlaceholder}
                className="input-field py-1.5 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleSelectModel(customModelName)
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Options section */}
      <div>
        <label className="text-xs font-medium text-surface-500 mb-2 block">
          {t.options.title}
        </label>
        <div className="flex gap-1.5">
          <button
            onClick={() => setAutoExtractEnabled(!autoExtractEnabled)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              autoExtractEnabled
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
            title={t.tooltips.autoExtract}
          >
            <Zap size={13} />
            {t.options.keyPointExtract}
          </button>
          <button
            onClick={() => setAutoRecommendTerms(!autoRecommendTerms)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
              autoRecommendTerms
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
            title={t.tooltips.termRecommend}
          >
            <Lightbulb size={13} />
            {t.options.termRecommend}
          </button>
        </div>
      </div>
    </div>
  )
}
