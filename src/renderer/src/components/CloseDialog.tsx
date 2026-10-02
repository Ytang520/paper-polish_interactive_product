import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n/context'

type CloseSaveOptions = {
  prompts: boolean
  apiConfig: boolean
  modelParams: boolean
}

interface CloseDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: (options: CloseSaveOptions) => void
}

export default function CloseDialog({ open, onCancel, onConfirm }: CloseDialogProps) {
  const { t } = useI18n()
  const [prompts, setPrompts] = useState(true)
  const [apiConfig, setApiConfig] = useState(true)
  const [modelParams, setModelParams] = useState(true)

  useEffect(() => {
    if (open) {
      setPrompts(true)
      setApiConfig(true)
      setModelParams(true)
    }
  }, [open])

  if (!open) return null

  const saveOptions: CloseSaveOptions = {
    prompts,
    apiConfig,
    modelParams
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-slide-up border border-surface-200"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900">{t.closeDialog.title}</h2>
          <button onClick={onCancel} className="p-1 hover:bg-surface-100 rounded-full transition-colors">
            <X size={18} className="text-surface-500" />
          </button>
        </div>

        <p className="text-sm text-surface-600 mb-5">{t.closeDialog.description}</p>

        <div className="space-y-2 mb-6">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:bg-surface-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={prompts}
              onChange={() => setPrompts(!prompts)}
              className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-surface-700">{t.closeDialog.prompts}</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:bg-surface-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={apiConfig}
              onChange={() => setApiConfig(!apiConfig)}
              className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-surface-700">{t.closeDialog.apiConfig}</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-surface-200 hover:bg-surface-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={modelParams}
              onChange={() => setModelParams(!modelParams)}
              className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-surface-700">{t.closeDialog.modelParams}</span>
          </label>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1 justify-center py-2.5">
            {t.common.cancel}
          </button>
          <button
            onClick={() => onConfirm(saveOptions)}
            className="btn-primary flex-1 justify-center py-2.5"
          >
            {t.closeDialog.saveAndClose}
          </button>
        </div>
      </div>
    </div>
  )
}
