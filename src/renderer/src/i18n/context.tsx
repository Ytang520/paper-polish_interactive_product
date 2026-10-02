import React, { createContext, useContext, useCallback } from 'react'
import { zh, type TranslationKeys } from './zh'
import { en } from './en'
import type { Language } from '../types'

const translations: Record<Language, TranslationKeys> = { zh, en }

interface I18nContextValue {
  t: TranslationKeys
  language: Language
  setLanguage: (lang: Language) => void
}

const I18nContext = createContext<I18nContextValue>({
  t: zh,
  language: 'zh',
  setLanguage: () => {}
})

interface I18nProviderProps {
  language: Language
  onLanguageChange: (lang: Language) => void
  children: React.ReactNode
}

export function I18nProvider({ language, onLanguageChange, children }: I18nProviderProps) {
  const setLanguage = useCallback(
    (lang: Language) => {
      onLanguageChange(lang)
    },
    [onLanguageChange]
  )

  const value: I18nContextValue = {
    t: translations[language] || zh,
    language,
    setLanguage
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
