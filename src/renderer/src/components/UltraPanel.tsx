import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import { getPrompt } from '../prompts'
import { collectStream } from '../lib/stream'
import type { UltraIteration, UltraEvaluation, ChatMessage } from '../types'
import {
  Zap,
  ToggleLeft,
  ToggleRight,
  Play,
  Square,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle
} from 'lucide-react'

export default function UltraPanel() {
  const { t, language } = useI18n()
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })
  const { updateActiveSession, showToast, settings } = useAppStore()

  const [isRunning, setIsRunning] = useState(false)
  const [currentPhase, setCurrentPhase] = useState<'idle' | 'generating' | 'evaluating'>('idle')
  const [expandedIteration, setExpandedIteration] = useState<number | null>(null)
  const abortRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => () => {
    abortRef.current = true
    controllerRef.current?.abort()
  }, [session?.id])

  const toggleUltraMode = () => {
    if (!session) return
    updateActiveSession({ ultraMode: !session.ultraMode })
  }

  const setMaxIterations = (val: number) => {
    if (!session) return
    updateActiveSession({ ultraMaxIterations: Math.max(1, Math.min(20, val)) })
  }

  // Run ultra iteration loop
  const runUltraLoop = useCallback(async () => {
    if (!session || !session.inputText.trim() || !window.api || controllerRef.current) return

    setIsRunning(true)
    abortRef.current = false
    const controller = new AbortController()
    controllerRef.current = controller
    const iterations: UltraIteration[] = []

    let currentText = session.outputText || session.inputText

    for (let i = 0; i < session.ultraMaxIterations; i++) {
      if (abortRef.current) break

      // === GENERATE PHASE ===
      setCurrentPhase('generating')

      const genMessages: ChatMessage[] = [
        {
          role: 'system',
          content: getPrompt(
            'ultra_generator',
            language,
            settings.customPrompts,
            settings.modules.ultra_generator.output_language
          )
        },
        {
          role: 'user',
          content: i === 0
            ? `请改写优化以下文本：\n\n${currentText}`
            : `请根据以下评估反馈改写优化文本：\n\n原文：\n${currentText}\n\n评估反馈：\n${iterations[i - 1]?.evaluation?.feedback.join('\n') || ''}`
        }
      ]

      let generatedText = ''
      try {
        generatedText = await collectStream({ messages: genMessages, moduleKey: 'ultra_generator' }, controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) showToast(String(error), 'error')
        break
      }

      if (abortRef.current || !generatedText) break

      // === EVALUATE PHASE ===
      setCurrentPhase('evaluating')

      const evalMessages: ChatMessage[] = [
        {
          role: 'system',
          content: getPrompt(
            'ultra_evaluator',
            language,
            settings.customPrompts,
            settings.modules.ultra_evaluator.output_language
          )
        },
        {
          role: 'user',
          content: generatedText
        }
      ]

      let evaluation: UltraEvaluation | null = null
      try {
        const evalResult = await collectStream({ messages: evalMessages, moduleKey: 'ultra_evaluator' }, controller.signal)
        evaluation = parseEvaluation(evalResult)
      } catch (error) {
        if (!controller.signal.aborted) showToast(String(error), 'error')
        // Still record the iteration with null evaluation
      }

      if (controller.signal.aborted || useAppStore.getState().activeSessionId !== session.id) break
      const iteration: UltraIteration = {
        iteration: i + 1,
        generatedText,
        evaluation
      }
      iterations.push(iteration)
      currentText = generatedText

      // Update session with current iterations
      updateActiveSession({
        ultraIterations: [...iterations],
        outputText: generatedText
      })

      setExpandedIteration(i + 1)

      // Check if passed
      if (evaluation?.passed) {
        showToast(t.ultra.passed, 'success')
        break
      }

      // Check if max reached
      if (i === session.ultraMaxIterations - 1) {
        showToast(t.ultra.maxReached, 'info')
      }
    }

    setIsRunning(false)
    setCurrentPhase('idle')
    controllerRef.current = null
  }, [session, language, settings, showToast, t, updateActiveSession])

  if (!session) return null

  const handleStop = () => {
    abortRef.current = true
    controllerRef.current?.abort()
  }

  function parseEvaluation(raw: string): UltraEvaluation | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0])
      return {
        scores: {
          professionalism: parsed.scores?.professionalism || 0,
          clarity: parsed.scores?.clarity || 0,
          logic: parsed.scores?.logic || 0,
          naturalFlow: parsed.scores?.naturalFlow || 0,
          overall: parsed.scores?.overall || 0
        },
        passed: !!parsed.passed,
        feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
        summary: parsed.summary || ''
      }
    } catch {
      return null
    }
  }

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-surface-700 flex items-center gap-1.5">
          <Zap size={13} className="text-amber-500" />
          {t.ultra.title}
        </h3>
        <button onClick={toggleUltraMode} className="text-surface-500 hover:text-amber-600 transition-colors">
          {session.ultraMode
            ? <ToggleRight size={20} className="text-amber-500" />
            : <ToggleLeft size={20} />
          }
        </button>
      </div>

      {!session.ultraMode ? (
        <p className="text-[11px] text-surface-400">{t.ultra.description}</p>
      ) : (
        <div className="space-y-3">
          {/* Max iterations config */}
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-surface-600">{t.ultra.maxIterations}</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMaxIterations(session.ultraMaxIterations - 1)}
                className="w-6 h-6 rounded bg-surface-100 text-surface-600 hover:bg-surface-200 text-xs font-bold"
                disabled={isRunning}
              >
                −
              </button>
              <span className="text-sm font-mono w-6 text-center">{session.ultraMaxIterations}</span>
              <button
                onClick={() => setMaxIterations(session.ultraMaxIterations + 1)}
                className="w-6 h-6 rounded bg-surface-100 text-surface-600 hover:bg-surface-200 text-xs font-bold"
                disabled={isRunning}
              >
                +
              </button>
            </div>
          </div>

          {/* Start/Stop button */}
          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={runUltraLoop}
                disabled={!session.inputText.trim()}
                className="btn-primary flex-1 justify-center text-xs py-2 bg-amber-500 hover:bg-amber-600 border-amber-500"
              >
                <Play size={13} />
                {t.ultra.enable}
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="btn-danger flex-1 justify-center text-xs py-2"
              >
                <Square size={13} />
                {currentPhase === 'generating' ? t.ultra.generating : t.ultra.evaluating}
              </button>
            )}
          </div>

          {/* Iteration history */}
          {session.ultraIterations.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {session.ultraIterations.map((iter) => (
                <div key={iter.iteration} className="border border-surface-200 rounded-md overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-2 py-1.5 bg-surface-50 cursor-pointer hover:bg-surface-100 transition-colors"
                    onClick={() => setExpandedIteration(
                      expandedIteration === iter.iteration ? null : iter.iteration
                    )}
                  >
                    {iter.evaluation?.passed
                      ? <CheckCircle2 size={12} className="text-green-500" />
                      : <XCircle size={12} className="text-red-400" />
                    }
                    <span className="text-xs font-medium text-surface-700 flex-1">
                      {t.ultra.iteration.replace('{n}', String(iter.iteration))}
                    </span>
                    {iter.evaluation && (
                      <span className="text-[10px] font-mono text-surface-500">
                        {t.ultra.score}: {iter.evaluation.scores.overall}/10
                      </span>
                    )}
                    {expandedIteration === iter.iteration ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </div>

                  {expandedIteration === iter.iteration && iter.evaluation && (
                    <div className="p-2 border-t border-surface-200 space-y-2">
                      {/* Score bars */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(iter.evaluation.scores).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-[10px] text-surface-500 w-16 truncate capitalize">{key}</span>
                            <div className="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  (val as number) >= 8 ? 'bg-green-500' : (val as number) >= 5 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${((val as number) / 10) * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono text-surface-500 w-4">{val as number}</span>
                          </div>
                        ))}
                      </div>

                      {/* Feedback */}
                      {iter.evaluation.feedback.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-medium text-surface-600">{t.ultra.feedback}:</p>
                          {iter.evaluation.feedback.map((fb, idx) => (
                            <p key={idx} className="text-[10px] text-surface-500 pl-2 border-l-2 border-surface-200">
                              {fb}
                            </p>
                          ))}
                        </div>
                      )}

                      {iter.evaluation.summary && (
                        <p className="text-[10px] text-surface-500 italic">{iter.evaluation.summary}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
