import React, { useEffect } from 'react'
import { I18nProvider } from './i18n/context'
import { useAppStore } from './store'
import Layout from './components/Layout'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900">
          <div className="max-w-md text-center p-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-red-500 text-2xl">!</span>
            </div>
            <h2 className="text-lg font-semibold text-surface-800 mb-2">渲染错误 / Render Error</h2>
            <p className="text-sm text-surface-500 mb-4">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 transition-colors"
            >
              重试 / Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { settings, settingsLoaded, loadSettings, updateSettings, showToast } = useAppStore()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'dark') {
      root.classList.add('dark')
      return
    }

    root.classList.remove('dark')
  }, [settings.theme])

  useEffect(() => {
    if (!settingsLoaded) return

    let mounted = true
    const maybeToastStatus = (status: { state: 'idle' | 'connected' | 'started' | 'error'; message: string }) => {
      if (status.state === 'idle') return
      showToast(status.message, status.state === 'error' ? 'error' : status.state === 'started' ? 'success' : 'info')
    }

    void window.api?.getCopilotStatus?.().then((status) => {
      if (mounted) maybeToastStatus(status)
    })

    const unsubscribe = window.api?.onCopilotStatus?.((status) => {
      if (mounted) maybeToastStatus(status)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [settingsLoaded, showToast])

  if (!settingsLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-surface-500 text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  const handleLanguageChange = (lang: 'zh' | 'en') => {
    updateSettings({ ...settings, language: lang })
  }

  return (
    <ErrorBoundary>
      <I18nProvider language={settings.language} onLanguageChange={handleLanguageChange}>
        <Layout />
      </I18nProvider>
    </ErrorBoundary>
  )
}
