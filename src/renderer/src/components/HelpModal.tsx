import React from 'react'
import { useI18n } from '../i18n/context'
import { X, Workflow, ArrowRight, Play, Square, CheckCircle2, RotateCcw, Settings, Library, Sparkles } from 'lucide-react'

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

type HelpSection = 'workflow'

const SECTION_ICONS: Record<HelpSection, React.ElementType> = {
  workflow: Workflow
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const { t } = useI18n()
  const [activeSection, setActiveSection] = React.useState<HelpSection>('workflow')

  React.useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const sections: Array<{ id: HelpSection; label: string }> = [
    { id: 'workflow', label: t.help.workflow }
  ]

  const flowSteps = [
    {
      icon: Settings,
      title: t.help.workflowSetupTitle,
      description: t.help.workflowSetupDesc,
      tone: 'bg-sky-50 border-sky-200 text-sky-700'
    },
    {
      icon: Play,
      title: t.help.workflowStartTitle,
      description: t.help.workflowStartDesc,
      tone: 'bg-indigo-50 border-indigo-200 text-indigo-700'
    },
    {
      icon: Square,
      title: t.help.workflowStopTitle,
      description: t.help.workflowStopDesc,
      tone: 'bg-rose-50 border-rose-200 text-rose-700'
    },
    {
      icon: CheckCircle2,
      title: t.help.workflowFinishTitle,
      description: t.help.workflowFinishDesc,
      tone: 'bg-emerald-50 border-emerald-200 text-emerald-700'
    },
    {
      icon: RotateCcw,
      title: t.help.workflowRegenTitle,
      description: t.help.workflowRegenDesc,
      tone: 'bg-amber-50 border-amber-200 text-amber-700'
    },
    {
      icon: Sparkles,
      title: t.help.workflowIterateTitle,
      description: t.help.workflowIterateDesc,
      tone: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[82vh] border border-surface-200 animate-slide-up overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-full min-h-0">
          <aside className="w-64 border-r border-surface-200 bg-surface-50 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-surface-900">{t.help.title}</h2>
                <p className="text-xs text-surface-500 mt-1">{t.help.subtitle}</p>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-surface-100 rounded-full transition-colors">
                <X size={18} className="text-surface-500" />
              </button>
            </div>

            <div className="space-y-1">
              {sections.map((section) => {
                const Icon = SECTION_ICONS[section.id]
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-surface-700 hover:bg-surface-100'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{section.label}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="flex-1 min-h-0 overflow-y-auto p-6 bg-white">
            {activeSection === 'workflow' && (
              <div className="space-y-8">
                <section className="rounded-2xl border border-surface-200 bg-[linear-gradient(135deg,#f8fbff_0%,#f9fafb_50%,#eef6ff_100%)] p-6">
                  <div className="max-w-3xl space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
                      <Workflow size={14} />
                      {t.help.workflow}
                    </div>
                    <h3 className="text-2xl font-bold text-surface-900">{t.help.workflowHeadline}</h3>
                    <p className="text-sm leading-6 text-surface-600">{t.help.workflowIntro}</p>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-surface-800">
                    <Library size={16} className="text-primary-600" />
                    {t.help.workflowMainPath}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-6 md:grid-cols-2">
                    {flowSteps.map((step, index) => {
                      const Icon = step.icon
                      return (
                        <React.Fragment key={step.title}>
                          <div className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm min-h-[180px] flex flex-col">
                            <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${step.tone}`}>
                              <Icon size={14} />
                              {index + 1}
                            </div>
                            <h4 className="mt-4 text-sm font-bold text-surface-900">{step.title}</h4>
                            <p className="mt-2 text-xs leading-5 text-surface-600">{step.description}</p>
                          </div>
                          {index < flowSteps.length - 1 && (
                            <div className="hidden xl:flex items-center justify-center text-surface-300">
                              <ArrowRight size={18} />
                            </div>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-surface-200 bg-surface-50 p-5">
                    <h4 className="text-sm font-bold text-surface-900">{t.help.workflowButtonsTitle}</h4>
                    <p className="mt-2 text-xs leading-5 text-surface-600">{t.help.workflowButtonsDesc}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-200 bg-surface-50 p-5">
                    <h4 className="text-sm font-bold text-surface-900">{t.help.workflowResourcesTitle}</h4>
                    <p className="mt-2 text-xs leading-5 text-surface-600">{t.help.workflowResourcesDesc}</p>
                  </div>
                  <div className="rounded-2xl border border-surface-200 bg-surface-50 p-5">
                    <h4 className="text-sm font-bold text-surface-900">{t.help.workflowCarryTitle}</h4>
                    <p className="mt-2 text-xs leading-5 text-surface-600">{t.help.workflowCarryDesc}</p>
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
