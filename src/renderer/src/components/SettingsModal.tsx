import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import { MODEL_PRESETS, MODULE_INFO, DEFAULT_MODULE_CONFIG, COPILOT_BASE_URL, getPresetModelsForModule, isCopilotProvider, type ModuleKey, type AppSettings, type ModuleConfig } from '../types'
import { DEFAULT_PROMPTS } from '../prompts'
import { X, Eye, EyeOff, RotateCcw, Check, Globe, FileText, Settings, Sparkles, Brain, AlignLeft, AlignJustify, Type, List, Search, BookOpen, ChevronDown, ChevronRight, Plus, Trash2, Wand2, Layers, Cpu, Boxes, Palette, Keyboard } from 'lucide-react'

type SettingsTermId = string | number

type SettingsTermEntry = {
  id?: SettingsTermId
  term: string
  definition: string
}

type SettingsTerminologyApi = typeof window.api & {
  getProTerminology?: () => Promise<Array<{ id: number; term: string; definition: string }>>
  addProTerm?: (term: string, definition: string) => Promise<{ id: number; term: string; definition: string }>
  deleteProTerm?: (id: number) => Promise<void>
  updateProTerm?: (id: string | number, term: string, definition: string) => Promise<void>
}

type NavItem = {
  id: string
  label: string
  icon?: React.ElementType
}

type NavCategory = {
  id: string
  label: string
  icon: React.ElementType
  items: NavItem[]
}

type LocalAppSettings = AppSettings & {
  shortcuts?: Record<string, string>
}

type CopilotStatus = {
  state: 'idle' | 'connected' | 'started' | 'error'
  message: string
  connected: boolean
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  word_refinement: Type,
  sentence_refinement: AlignLeft,
  paragraph_refinement: AlignJustify,
  paragraph_generation: Sparkles,
  intent_parser: Search,
  ultra_generator: Brain,
  ultra_evaluator: List,
  embedding: Settings
}

const DEFAULT_SHORTCUTS: Record<string, string> = {
  continuePolish: 'Ctrl+Enter',
  startStopPolish: 'Alt+L',
  rename: 'F2',
  newSession: 'Ctrl+N',
  settings: 'Ctrl+,'
}

const SHORTCUT_KEYS = ['continuePolish', 'startStopPolish', 'rename', 'newSession', 'settings'] as const

export default function SettingsModal() {
  const { t, language } = useI18n()
  const { settings, settingsOpen, setSettingsOpen, updateSettings, persistSettings } = useAppStore()

  const [localSettings, setLocalSettings] = useState<LocalAppSettings | null>(null)
  const [globalConfig, setGlobalConfig] = useState({ base_url: '', api_key: '' })
  const [activeSection, setActiveSection] = useState('global_settings')

  const [showGlobalKey, setShowGlobalKey] = useState(false)
  const [showModuleKey, setShowModuleKey] = useState(false)
  const [recordingShortcut, setRecordingShortcut] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const [copilotStatus, setCopilotStatus] = useState<CopilotStatus | null>(null)

  const [proTerms, setProTerms] = useState<SettingsTermEntry[]>([])
  const [newProTerm, setNewProTerm] = useState('')
  const [newProDefinition, setNewProDefinition] = useState('')

  const terminologyApi = window.api as unknown as SettingsTerminologyApi | undefined

  const moduleSectionMap: Record<string, ModuleKey> = {
    word_refinement: 'word_refinement',
    sentence_refinement: 'sentence_refinement',
    paragraph_refinement: 'paragraph_refinement',
    paragraph_generation: 'paragraph_generation',
    intent_parser: 'intent_parser',
    ultra_generator: 'ultra_generator',
    ultra_evaluator: 'ultra_evaluator',
    embedding: 'embedding'
  }

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    basic: true,
    polish: true,
    generation: true,
    ultra: true,
    embedding: true,
    terminology: true,
    advanced: true
  })

  const moduleLabel = (moduleKey: ModuleKey) => {
    const info = MODULE_INFO[moduleKey]
    if (!info) return moduleKey
    return language === 'zh' ? info.zh : info.en
  }

  const navCategories: NavCategory[] = [
    {
      id: 'basic',
      label: t.settings.basicSettings,
      icon: Globe,
      items: [
        { id: 'global_settings', label: t.settings.globalSettings, icon: Globe },
        { id: 'appearance', label: t.settings.appearance, icon: Palette },
        { id: 'keyboard_shortcuts', label: t.settings.keyboardShortcuts, icon: Keyboard }
      ]
    },
    {
      id: 'polish',
      label: t.settings.polishSettings,
      icon: Wand2,
      items: [
        { id: 'word_refinement', label: moduleLabel('word_refinement'), icon: MODULE_ICONS.word_refinement },
        { id: 'sentence_refinement', label: moduleLabel('sentence_refinement'), icon: MODULE_ICONS.sentence_refinement },
        { id: 'paragraph_refinement', label: moduleLabel('paragraph_refinement'), icon: MODULE_ICONS.paragraph_refinement }
      ]
    },
    {
      id: 'generation',
      label: t.settings.generationSettings,
      icon: Sparkles,
      items: [
        { id: 'paragraph_generation', label: moduleLabel('paragraph_generation'), icon: MODULE_ICONS.paragraph_generation },
        { id: 'intent_parser', label: moduleLabel('intent_parser'), icon: MODULE_ICONS.intent_parser }
      ]
    },
    {
      id: 'ultra',
      label: t.settings.ultraSettings,
      icon: Cpu,
      items: [
        { id: 'ultra_generator', label: moduleLabel('ultra_generator'), icon: MODULE_ICONS.ultra_generator },
        { id: 'ultra_evaluator', label: moduleLabel('ultra_evaluator'), icon: MODULE_ICONS.ultra_evaluator }
      ]
    },
    {
      id: 'embedding',
      label: t.settings.vectorEmbedding,
      icon: Layers,
      items: [{ id: 'embedding', label: moduleLabel('embedding'), icon: MODULE_ICONS.embedding }]
    },
    {
      id: 'terminology',
      label: t.settings.terminology,
      icon: BookOpen,
      items: [{ id: 'terminology', label: t.settings.terminology, icon: BookOpen }]
    },
    {
      id: 'advanced',
      label: t.settings.advancedFeatures,
      icon: Boxes,
      items: [{ id: 'advanced', label: t.settings.advancedFeatures, icon: Settings }]
    }
  ]

  useEffect(() => {
    if (settingsOpen && settings) {
      const parsed = JSON.parse(JSON.stringify(settings))
      parsed.shortcuts = {
        ...DEFAULT_SHORTCUTS,
        ...(parsed.shortcuts || {})
      }
      setLocalSettings(parsed)
      setGlobalConfig({ base_url: '', api_key: '' })
      setShowGlobalKey(false)
      setShowModuleKey(false)
      setRecordingShortcut(null)
      setActiveSection('global_settings')
      setExpandedCategories({
        basic: true,
        polish: true,
        generation: true,
        ultra: true,
        embedding: true,
        terminology: true,
        advanced: true
      })
    }
  }, [settingsOpen, settings])

  const loadProTerms = useCallback(async () => {
    try {
      if (terminologyApi?.getProTerminology) {
        const terms = await terminologyApi.getProTerminology()
        setProTerms(terms || [])
      }
    } catch {
      setProTerms([])
    }
  }, [terminologyApi])

  useEffect(() => {
    if (!settingsOpen) return
    loadProTerms()
  }, [settingsOpen, loadProTerms])

  useEffect(() => {
    if (!settingsOpen) return

    let mounted = true
    void window.api?.getCopilotStatus?.().then((status) => {
      if (mounted) setCopilotStatus(status)
    })

    const unsubscribe = window.api?.onCopilotStatus?.((status) => {
      if (mounted) setCopilotStatus(status)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [settingsOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOpen) {
        setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen, setSettingsOpen])

  const handleSave = () => {
    if (localSettings) {
      document.documentElement.classList.toggle('dark', localSettings.theme === 'dark')
      updateSettings(localSettings)
      setSettingsOpen(false)
    }
  }

  const handleApplyGlobal = () => {
    if (!localSettings) return
    const showToast = useAppStore.getState().showToast

    try {
      const newSettings = { ...localSettings }

      Object.keys(newSettings.modules).forEach((key) => {
        const moduleKey = key as ModuleKey
        if (newSettings.modules[moduleKey]) {
          if (isCopilotProvider(newSettings.modules[moduleKey].base_url)) {
            return
          }
          newSettings.modules[moduleKey] = {
            ...newSettings.modules[moduleKey],
            base_url: globalConfig.base_url || newSettings.modules[moduleKey].base_url,
            api_key: globalConfig.api_key || newSettings.modules[moduleKey].api_key
          }
        }
      })

      setLocalSettings(newSettings)
      showToast(t.settings.applySuccess, 'success')
    } catch {
      showToast(t.settings.applyFailed, 'error')
    }
  }

  const updateModuleConfig = (key: ModuleKey, updates: Partial<ModuleConfig>) => {
    if (!localSettings) return
    setLocalSettings({
      ...localSettings,
      modules: {
        ...localSettings.modules,
        [key]: { ...localSettings.modules[key], ...updates }
      }
    })
  }

  const updateTheme = (theme: 'light' | 'dark') => {
    if (!localSettings) return
    document.documentElement.classList.toggle('dark', theme === 'dark')
    setLocalSettings({
      ...localSettings,
      theme
    })
  }

  const updateGlobalOutputLanguage = (output_language: 'en' | 'zh') => {
    if (!localSettings) return
    const updatedModules = Object.keys(localSettings.modules).reduce((acc, key) => {
      const moduleKey = key as ModuleKey
      acc[moduleKey] = {
        ...localSettings.modules[moduleKey],
        output_language
      }
      return acc
    }, {} as AppSettings['modules'])

    setLocalSettings({
      ...localSettings,
      modules: updatedModules
    })
  }

  const resetModuleToDefaults = (key: ModuleKey) => {
    if (!localSettings) return
    setLocalSettings({
      ...localSettings,
      modules: {
        ...localSettings.modules,
        [key]: { ...DEFAULT_MODULE_CONFIG }
      }
    })
  }

  const updateCustomPrompt = (key: ModuleKey, value: string) => {
    if (!localSettings) return
    setLocalSettings({
      ...localSettings,
      customPrompts: {
        ...localSettings.customPrompts,
        [`${key}_${language}`]: value
      }
    })
  }

  const resetCustomPrompt = (key: ModuleKey) => {
    if (!localSettings) return
    const newPrompts = { ...localSettings.customPrompts }
    delete newPrompts[`${key}_${language}`]
    setLocalSettings({
      ...localSettings,
      customPrompts: newPrompts
    })
  }

  const handleAddProTerm = async () => {
    const term = newProTerm.trim()
    const definition = newProDefinition.trim()
    if (!term) return

    const tempId = Date.now()
    setProTerms((prev) => [...prev, { id: tempId, term, definition }])
    setNewProTerm('')
    setNewProDefinition('')

    try {
      if (terminologyApi?.addProTerm) {
        const created = await terminologyApi.addProTerm(term, definition)
        setProTerms((prev) => prev.map((item) => (item.id === tempId ? created : item)))
      }
    } catch {
      // Keep local fallback state even if IPC fails.
    }
  }

  const handleDeleteProTerm = async (id: SettingsTermId | undefined) => {
    if (id === undefined) return
    setProTerms((prev) => prev.filter((item) => item.id !== id))
    try {
      if (typeof id === 'number' && terminologyApi?.deleteProTerm) {
        await terminologyApi.deleteProTerm(id)
      }
    } catch {
      // Keep local fallback state even if IPC fails.
    }
  }

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }))
  }

  if (!settingsOpen || !localSettings) return null

  const formatShortcutCombo = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return ''

    const parts: string[] = []
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.metaKey) parts.push('Meta')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')

    let key = event.key
    if (key === ' ') key = 'Space'
    if (key === 'Escape') key = 'Esc'
    if (key.startsWith('Arrow')) key = key.replace('Arrow', '')
    if (key.length === 1) key = key.toUpperCase()

    parts.push(key)
    return parts.join('+')
  }

  const handleShortcutCapture = (shortcutKey: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setRecordingShortcut(null)
      return
    }

    const combo = formatShortcutCombo(event)
    if (!combo) return

    setLocalSettings({
      ...localSettings,
      shortcuts: {
        ...DEFAULT_SHORTCUTS,
        ...(localSettings.shortcuts || {}),
        [shortcutKey]: combo
      }
    })
    setRecordingShortcut(null)
  }

  const renderModuleConfig = (moduleKey: ModuleKey) => {
    const config = localSettings.modules[moduleKey] || DEFAULT_MODULE_CONFIG
    const info = MODULE_INFO[moduleKey]
    const activePreset = MODEL_PRESETS.find((p) => p.baseUrl === config.base_url)
    const presetModels = getPresetModelsForModule(activePreset, moduleKey)
    const isManagedCopilot = isCopilotProvider(config.base_url)

    const currentPrompt = localSettings.customPrompts[`${moduleKey}_${language}`] || ''
    const defaultPrompt = DEFAULT_PROMPTS[moduleKey]?.[language] || DEFAULT_PROMPTS[moduleKey]?.en || ''
    const isModified = !!localSettings.customPrompts[`${moduleKey}_${language}`]
    const hasCustomPrompt = !!DEFAULT_PROMPTS[moduleKey]

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
              {React.createElement(MODULE_ICONS[moduleKey] || Settings, { size: 18, className: 'text-primary-600' })}
              {moduleLabel(moduleKey)}
            </h3>
            <p className="text-surface-500 dark:text-surface-400 text-sm mt-1 max-w-lg">
              {info?.[`description_${language}` as keyof typeof info]}
            </p>
          </div>
          <button
            onClick={() => resetModuleToDefaults(moduleKey)}
            className="btn-ghost text-xs text-surface-400 hover:text-red-500"
            title={t.settings.reset}
          >
            <RotateCcw size={14} className="mr-1.5" />
            {t.settings.reset}
          </button>
        </div>

        <div className="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-4 sm:p-6 space-y-6">
          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.modelName}</label>
            <div className="flex gap-2 items-end">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={config.model_name}
                  onChange={(e) => updateModuleConfig(moduleKey, { model_name: e.target.value })}
                  className="input-field w-full font-mono text-sm"
                  placeholder="gpt-4o"
                  list={`models-${moduleKey}`}
                />
                <datalist id={`models-${moduleKey}`}>
                  {presetModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </div>
              <div className="shrink-0">
                <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">{t.settings.outputLanguage}</label>
                <select
                  className="input-field w-24 text-sm"
                  value={config.output_language}
                  onChange={(e) => updateModuleConfig(moduleKey, { output_language: e.target.value as 'en' | 'zh' })}
                >
                  <option value="en">{t.settings.outputEn}</option>
                  <option value="zh">{t.settings.outputZh}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.presets}</label>
            <select
              className="input-field w-full"
              value={activePreset?.name || ''}
              onChange={(e) => {
                const preset = MODEL_PRESETS.find((p) => p.name === e.target.value)
                if (preset) {
                  const nextModels = getPresetModelsForModule(preset, moduleKey)
                  updateModuleConfig(moduleKey, {
                    base_url: preset.baseUrl,
                    model_name: nextModels[0] || config.model_name,
                    api_key: preset.managed ? '' : config.api_key
                  })
                }
              }}
            >
              <option value="" disabled>{t.settings.selectPreset}</option>
              {MODEL_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.baseUrl}</label>
              <input
                type="text"
                value={config.base_url}
                onChange={(e) => updateModuleConfig(moduleKey, { base_url: e.target.value })}
                className="input-field w-full font-mono text-sm"
                placeholder="https://api.openai.com/v1"
                disabled={isManagedCopilot}
              />
              {isManagedCopilot && (
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  {language === 'zh'
                    ? `GitHub Copilot 固定使用 ${COPILOT_BASE_URL}，由应用自动连接本地 provider。`
                    : `GitHub Copilot is fixed to ${COPILOT_BASE_URL} and is auto-managed by the app.`}
                </p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.apiKey}</label>
              <div className="relative">
                <input
                  type={isManagedCopilot ? 'text' : showModuleKey ? 'text' : 'password'}
                  value={isManagedCopilot ? (language === 'zh' ? '由应用自动从本地文件读取' : 'Managed automatically from local file') : config.api_key}
                  onChange={(e) => updateModuleConfig(moduleKey, { api_key: e.target.value })}
                  className="input-field w-full font-mono text-sm pr-10"
                  placeholder="sk-..."
                  disabled={isManagedCopilot}
                />
                {!isManagedCopilot && (
                  <button
                    type="button"
                    onClick={() => setShowModuleKey(!showModuleKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                  >
                    {showModuleKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
              {isManagedCopilot && copilotStatus && (
                <p className={`text-xs ${copilotStatus.connected ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {copilotStatus.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.temperature}</label>
                <span className="text-xs font-mono text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-700 px-1.5 rounded">{config.temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.temperature}
                onChange={(e) => updateModuleConfig(moduleKey, { temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary-600 cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.maxTokens}</label>
              <input
                type="number"
                value={config.max_tokens}
                onChange={(e) => updateModuleConfig(moduleKey, { max_tokens: parseInt(e.target.value, 10) || 2048 })}
                className="input-field w-full font-mono text-sm"
              />
            </div>

            <div className="md:col-span-2 flex items-center justify-between p-4 bg-surface-100/50 dark:bg-surface-700/50 rounded-lg border border-surface-200 dark:border-surface-600">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-surface-800 dark:text-surface-200">{t.settings.reasoningMode}</label>
                <p className="text-xs text-surface-500 dark:text-surface-400">{t.settings.reasoningModeDesc}</p>
              </div>
              <button
                onClick={() => updateModuleConfig(moduleKey, { reasoning_mode: !config.reasoning_mode })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  config.reasoning_mode ? 'bg-primary-600' : 'bg-surface-300 dark:bg-surface-600'
                }`}
              >
                <span
                  className={`${
                    config.reasoning_mode ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </button>
            </div>
          </div>
        </div>

        {hasCustomPrompt && (
          <div className="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
            <div className="bg-surface-100/50 dark:bg-surface-700/50 px-4 py-3 border-b border-surface-200 dark:border-surface-700 flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-surface-800 dark:text-surface-200 flex items-center gap-2">
                  <FileText size={16} className="text-primary-600" />
                  {t.settings.customPrompt}
                </h4>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{t.settings.customPromptDesc}</p>
              </div>
              {isModified && (
                <button
                  onClick={() => resetCustomPrompt(moduleKey)}
                  className="text-xs flex items-center gap-1 text-surface-500 hover:text-red-500 transition-colors"
                >
                  <RotateCcw size={12} />
                  {t.settings.reset}
                </button>
              )}
            </div>
            <div className="p-4">
              <textarea
                value={currentPrompt}
                onChange={(e) => updateCustomPrompt(moduleKey, e.target.value)}
                placeholder={defaultPrompt}
                className="w-full h-44 input-field font-mono text-xs leading-relaxed resize-y"
              />
              <div className="mt-2 text-xs text-surface-400 dark:text-surface-500 text-right">
                {isModified ? t.settings.customized : t.settings.usingDefault}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderGlobalApiSection = () => (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
          <Globe size={18} className="text-primary-600" />
          {t.settings.globalSettings}
        </h3>
        <p className="text-surface-500 dark:text-surface-400 text-sm mt-1">{t.settings.globalSettingsDesc}</p>
      </div>

      <div className="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-4 sm:p-6 space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.baseUrl}</label>
          <input
            type="text"
            value={globalConfig.base_url}
            onChange={(e) => setGlobalConfig((prev) => ({ ...prev, base_url: e.target.value }))}
            placeholder="https://api.openai.com/v1"
            className="input-field w-full font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.apiKey}</label>
          <div className="relative">
            <input
              type={showGlobalKey ? 'text' : 'password'}
              value={globalConfig.api_key}
              onChange={(e) => setGlobalConfig((prev) => ({ ...prev, api_key: e.target.value }))}
              placeholder="sk-..."
              className="input-field w-full font-mono text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowGlobalKey(!showGlobalKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
            >
              {showGlobalKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <button onClick={handleApplyGlobal} className="btn-primary w-full justify-center py-2.5">
            <Check size={18} className="mr-2" />
            {t.settings.applyToAll}
          </button>
          <p className="text-xs text-surface-400 text-center mt-3">{t.settings.applyToAllDesc}</p>
        </div>
      </div>

    </div>
  )

  const renderAppearanceSection = () => (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
          <Palette size={18} className="text-primary-600" />
          {t.settings.appearance}
        </h3>
      </div>

      <div className="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg p-4 sm:p-6 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.theme}</label>
          <div className="inline-flex rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700 p-1">
            <button
              type="button"
              onClick={() => updateTheme('light')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                localSettings.theme === 'light' ? 'bg-primary-600 text-white' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600'
              }`}
            >
              {t.settings.themeLight}
            </button>
            <button
              type="button"
              onClick={() => updateTheme('dark')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                localSettings.theme === 'dark' ? 'bg-primary-600 text-white' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600'
              }`}
            >
              {t.settings.themeDark}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t.settings.language}</label>
          <select
            className="input-field w-full md:w-48"
            value={localSettings.language}
            onChange={(e) => setLocalSettings({ ...localSettings, language: e.target.value as 'zh' | 'en' })}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </div>
  )

  const renderKeyboardShortcutsSection = () => {
    const shortcuts = localSettings.shortcuts || DEFAULT_SHORTCUTS

    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Keyboard size={18} className="text-primary-600" />
            {t.settings.keyboardShortcuts}
          </h3>
          <p className="text-surface-500 dark:text-surface-400 text-sm mt-1">{t.settings.keyboardShortcutsDesc}</p>
        </div>

        <div className="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-0">
            <div className="px-4 py-2.5 bg-surface-100/70 dark:bg-surface-700/50 border-b border-surface-200 dark:border-surface-700">
              <span className="text-xs font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wider">{t.settings.shortcutAction}</span>
            </div>
            <div className="px-4 py-2.5 bg-surface-100/70 dark:bg-surface-700/50 border-b border-surface-200 dark:border-surface-700">
              <span className="text-xs font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wider">{t.settings.shortcutBinding}</span>
            </div>

            {SHORTCUT_KEYS.map((key) => {
              const descKey = `shortcutDesc_${key}` as keyof typeof t.settings
              const description = (t.settings as Record<string, string>)[descKey] || key
              const binding = shortcuts[key] || DEFAULT_SHORTCUTS[key] || ''
              const isRecording = recordingShortcut === key

              return (
                <React.Fragment key={key}>
                  <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-700/50 flex items-center">
                    <span className="text-sm text-surface-700 dark:text-surface-300">{description}</span>
                  </div>
                  <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-700/50 flex items-center justify-end">
                    {isRecording ? (
                      <input
                        autoFocus
                        readOnly
                        className="px-3 py-1 text-xs font-mono bg-primary-50 dark:bg-primary-900/30 border-2 border-primary-400 dark:border-primary-600 rounded-md text-primary-700 dark:text-primary-300 outline-none w-36 text-center animate-pulse"
                        placeholder={t.settings.pressNewShortcut}
                        onKeyDown={(e) => handleShortcutCapture(key, e)}
                        onBlur={() => setRecordingShortcut(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setRecordingShortcut(key)}
                        className="px-3 py-1 text-xs font-mono bg-surface-100 dark:bg-surface-700 border border-surface-200 dark:border-surface-600 rounded-md text-surface-700 dark:text-surface-300 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer"
                      >
                        {binding}
                      </button>
                    )}
                  </div>
                </React.Fragment>
              )
            })}
          </div>

          <div className="px-4 py-3 flex justify-end">
            <button
              onClick={() => {
                setLocalSettings({
                  ...localSettings,
                  shortcuts: { ...DEFAULT_SHORTCUTS }
                })
              }}
              className="btn-ghost text-xs text-surface-400 hover:text-red-500"
            >
              <RotateCcw size={12} className="mr-1" />
              {t.settings.reset}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderTerminologySection = () => (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
        <BookOpen size={18} className="text-primary-600" />
        {t.settings.terminology}
      </h3>

      <div>
        <h4 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-2">{t.terminology.professional}</h4>
        <div className="space-y-2 mb-3">
          {proTerms.map((item, index) => (
            <div key={item.id ?? `${item.term}-${index}`} className="border border-surface-200 dark:border-surface-700 rounded-md px-3 py-2 flex items-start gap-3 bg-white dark:bg-surface-800">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200 break-words">{item.term}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400 break-words">{item.definition || '-'}</p>
              </div>
              <button
                onClick={() => handleDeleteProTerm(item.id)}
                className="p-1.5 text-surface-400 hover:text-red-500 transition-colors"
                title={t.common.delete}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            type="text"
            value={newProTerm}
            onChange={(e) => setNewProTerm(e.target.value)}
            placeholder={t.terminology.termPlaceholder || t.terminology.term}
            className="input-field text-sm"
          />
          <input
            type="text"
            value={newProDefinition}
            onChange={(e) => setNewProDefinition(e.target.value)}
            placeholder={t.terminology.definitionPlaceholder || t.terminology.definition}
            className="input-field text-sm"
          />
          <button onClick={handleAddProTerm} className="btn-primary px-3 py-2 justify-center">
            <Plus size={14} className="mr-1" />
            {t.terminology.add}
          </button>
        </div>
      </div>

    </div>
  )

  const renderActiveSection = () => {
    if (activeSection === 'global_settings') return renderGlobalApiSection()
    if (activeSection === 'appearance') return renderAppearanceSection()
    if (activeSection === 'keyboard_shortcuts') return renderKeyboardShortcutsSection()
    if (activeSection === 'terminology') return renderTerminologySection()
    if (activeSection === 'advanced') {
      return (
        <div className="h-full min-h-[320px] flex items-center justify-center border border-dashed border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-800">
          <p className="text-surface-500 dark:text-surface-400 text-sm">{t.settings.comingSoon}</p>
        </div>
      )
    }

    const moduleKey = moduleSectionMap[activeSection]
    if (moduleKey) return renderModuleConfig(moduleKey)
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setSettingsOpen(false)}>
      <div
        ref={modalRef}
        className="relative flex flex-col w-full max-w-4xl h-[85vh] bg-surface-50 dark:bg-surface-900 rounded-xl shadow-2xl overflow-hidden animate-slide-up border border-surface-200 dark:border-surface-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-surface-200 dark:border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <Settings className="text-primary-600" size={20} />
            {t.settings.title}
          </h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex min-h-0">
          <aside className="w-52 border-r border-surface-200 dark:border-surface-700 overflow-y-auto bg-white/80 dark:bg-surface-800/80 custom-scrollbar">
            <div className="p-2">
              {navCategories.map((category) => {
                const Icon = category.icon
                const expanded = expandedCategories[category.id]

                return (
                  <div key={category.id} className="mb-1">
                    <button
                      className="w-full px-2.5 py-2 text-left rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors flex items-center gap-2"
                      onClick={() => toggleCategory(category.id)}
                    >
                      {expanded ? <ChevronDown size={14} className="text-surface-500" /> : <ChevronRight size={14} className="text-surface-500" />}
                      <Icon size={14} className="text-primary-600" />
                      <span className="text-xs font-semibold text-surface-700 dark:text-surface-300 leading-snug">{category.label}</span>
                    </button>

                    {expanded && (
                      <div className="ml-6 mt-1 space-y-0.5 border-l border-surface-200 dark:border-surface-700 pl-2">
                        {category.items.map((item) => {
                          const ItemIcon = item.icon
                          const isActive = activeSection === item.id

                          return (
                            <button
                              key={item.id}
                              onClick={() => setActiveSection(item.id)}
                              className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
                                isActive
                                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold border border-primary-200 dark:border-primary-700'
                                  : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700'
                              }`}
                            >
                              {ItemIcon ? <ItemIcon size={12} className={isActive ? 'text-primary-600' : 'text-surface-400'} /> : null}
                              <span className="leading-snug">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>

          <section className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {renderActiveSection()}
          </section>
        </div>

        <div className="p-4 bg-white dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700 flex justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => setSettingsOpen(false)}
            className="btn-ghost text-surface-600 hover:bg-surface-100 px-6"
          >
            {t.common.cancel}
          </button>
          <button
            onClick={async () => {
              if (localSettings) {
                document.documentElement.classList.toggle('dark', localSettings.theme === 'dark')
                await updateSettings(localSettings)
                await persistSettings()
                setSettingsOpen(false)
              }
            }}
            className="btn-ghost text-primary-600 hover:bg-primary-50 border border-primary-200 px-6"
          >
            {t.settings.saveToFile}
          </button>
          <button
            onClick={handleSave}
            className="btn-primary px-8 shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 transition-shadow"
          >
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  )
}
