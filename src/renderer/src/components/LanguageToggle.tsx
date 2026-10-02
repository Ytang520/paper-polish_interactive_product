import React from 'react'
import { useI18n } from '../i18n/context'
import { Globe } from 'lucide-react'

export default function LanguageToggle() {
  const { language, setLanguage } = useI18n()

  return (
    <button
      onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      className="btn-ghost gap-1.5 text-xs"
      title={language === 'zh' ? 'Switch to English' : '切换为中文'}
    >
      <Globe size={14} />
      <span>{language === 'zh' ? 'EN' : '中文'}</span>
    </button>
  )
}
