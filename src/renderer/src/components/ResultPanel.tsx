import React, { useCallback, useEffect } from 'react'
import { useI18n } from '../i18n/context'
import { useAppStore } from '../store'
import { getPrompt } from '../prompts'
import { collectStream, createRequestId } from '../lib/stream'
import type { ModuleKey, ChatMessage, StreamChunk } from '../types'
import HelpTooltip from './HelpTooltip'
import {
  Play,
  Square,
  Plus,
  X,
  Check,
  CheckCircle2,
  GripVertical,
  Sparkles
} from 'lucide-react'

type RecommendedTerm = {
  term: string
  definition: string
}

export default function ResultPanel() {
  const { t, language } = useI18n()
  const {
    isPolishing,
    streamingContent,
    settings,
    startPolishing,
    stopPolishing,
    appendStreamingContent,
    appendStreamingReasoning,
    setStreamingContent,
    setStreamingReasoning,
    setCurrentRequestId,
    finalizePolishing,
    addKeyPoint,
    showToast,
    setFlowTransitionOpen
  } = useAppStore()

  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })

  const useLlmKeypoints = useAppStore(s => s.useLlmKeypoints)
  const autoExtractEnabled = useAppStore(s => s.autoExtractEnabled)
  const autoRecommendTerms = useAppStore(s => s.autoRecommendTerms)
  const [recommendedTerms, setRecommendedTerms] = React.useState<RecommendedTerm[]>([])

  useEffect(() => {
    setRecommendedTerms([])
  }, [session?.id])

  const splitTextToPoints = useCallback((text: string): string[] => {
    return text
      .split(/[。\n.;；]/)
      .map(s => s.trim())
      .filter(s => s.length > 2)
  }, [])

  const runIntentParser = useCallback(
    async (userContent: string): Promise<string> => {
      if (!window.api) return ''
      return collectStream({
            messages: [
              {
                role: 'system',
                content: getPrompt(
                  'intent_parser',
                  language,
                  settings.customPrompts,
                  settings.modules.intent_parser.output_language
                )
              },
              { role: 'user', content: userContent }
            ],
            moduleKey: 'intent_parser'
      })
    },
    [language, settings]
  )

  const extractKeyPoints = useCallback(
    async (text: string, llmMode: boolean): Promise<string[]> => {
      if (!text.trim()) return []
      if (!llmMode || !window.api) {
        return splitTextToPoints(text)
      }

      try {
        const parsingContent = await runIntentParser(text)
        const jsonMatch = parsingContent.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { keyPoints?: string[] }
          if (Array.isArray(parsed.keyPoints) && parsed.keyPoints.length > 0) {
            return parsed.keyPoints.map(p => p.trim()).filter(Boolean)
          }
        }
        return splitTextToPoints(parsingContent || text)
      } catch (error) {
        console.warn('Intent parser failed, falling back to simple split:', error)
        return splitTextToPoints(text)
      }
    },
    [runIntentParser, splitTextToPoints]
  )

  const autoExtractKeypoints = useCallback(
    async (text: string) => {
      const sessionId = useAppStore.getState().activeSessionId
      const points = await extractKeyPoints(text, useAppStore.getState().useLlmKeypoints)
      if (useAppStore.getState().activeSessionId !== sessionId) return
      if (points.length === 0) return
      points.forEach(p => addKeyPoint(p))
      showToast(t.keyPoints.extracted, 'success')
    },
    [extractKeyPoints, addKeyPoint, showToast, t]
  )

  const recommendTermsFromText = useCallback(
    async (outputText: string): Promise<RecommendedTerm[]> => {
      if (!outputText.trim() || !window.api) return []
      try {
        const prompt =
          '从以下文本中提取专业术语和关键词汇，返回JSON格式 {"terms": [{"term": "术语", "definition": "释义"}]}。只返回JSON，不要其他内容。\n\n文本：' +
          outputText
        const parsingContent = await runIntentParser(prompt)
        const jsonMatch = parsingContent.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return []
        const parsed = JSON.parse(jsonMatch[0]) as {
          terms?: Array<{ term?: string; definition?: string }>
        }
        if (!Array.isArray(parsed.terms)) return []
        return parsed.terms
          .map(item => ({
            term: (item.term || '').trim(),
            definition: (item.definition || '').trim()
          }))
          .filter(item => item.term.length > 0)
      } catch (error) {
        console.warn('Term recommendation failed:', error)
        return []
      }
    },
    [runIntentParser]
  )

  const handleAcceptTerm = useCallback(
    async (index: number) => {
      if (!window.api || !session?.documentId) return
      const target = recommendedTerms[index]
      if (!target) return

      try {
        await window.api.addTerm(session.documentId, target.term, target.definition)
        setRecommendedTerms(prev => prev.filter((_, i) => i !== index))
        showToast(t.keyPoints.termAdded, 'success')
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Failed to add term', 'error')
      }
    },
    [recommendedTerms, session, showToast, t]
  )

  // Setup stream listener
  useEffect(() => {
    if (!window.api) return
    const unsub = window.api.onStreamChunk((requestId: string, chunk: unknown) => {
      const state = useAppStore.getState()
      if (!state.isPolishing || state.currentRequestId !== requestId) return
      const c = chunk as StreamChunk
      switch (c.type) {
        case 'content':
          appendStreamingContent(c.content)
          break
        case 'reasoning':
          appendStreamingReasoning(c.content)
          break
        case 'done': {
          // Get final streaming content and finalize
          const finalContent = useAppStore.getState().streamingContent
          if (finalContent) {
            finalizePolishing(finalContent)
            void (async () => {
              if (useAppStore.getState().autoExtractEnabled) {
                await autoExtractKeypoints(finalContent)
              }
              if (useAppStore.getState().autoRecommendTerms) {
                if (useAppStore.getState().activeSessionId !== state.activeSessionId) return
                const terms = await recommendTermsFromText(finalContent)
                if (useAppStore.getState().activeSessionId === state.activeSessionId) setRecommendedTerms(terms)
              }
            })()
          } else {
            stopPolishing()
          }
          break
        }
        case 'error':
          showToast(c.message, 'error')
          stopPolishing()
          break
      }
    })
    return () => {
      unsub()
    }
  }, [appendStreamingContent, appendStreamingReasoning, finalizePolishing, stopPolishing, showToast, autoExtractKeypoints, recommendTermsFromText])

  // Determine module key based on scope + mode
  const getModuleKey = useCallback((): ModuleKey => {
    if (!session) return 'paragraph_refinement'
    const { scope, mode } = session
    if (scope === 'word') return 'word_refinement'
    if (scope === 'sentence') return 'sentence_refinement'
    if (mode === 'generation') return 'paragraph_generation'
    return 'paragraph_refinement'
  }, [session])

  // Build messages for the LLM call
  const buildMessages = useCallback(async (): Promise<ChatMessage[]> => {
    if (!session) return []
    const moduleKey = getModuleKey()
    const outputLanguage = settings.modules[moduleKey].output_language
    const systemPrompt = getPrompt(moduleKey, language, settings.customPrompts, outputLanguage)
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ]

    // For refinement, include the original text
    if (session.mode === 'refinement') {
      let userContent = session.inputText

      // Inject RAG reference context
      try {
        const ragResults = await window.api.searchSimilar(session.inputText, 3)
        if (ragResults && ragResults.length > 0) {
          userContent += '\n\n---\n参考材料 / Reference Context:\n'
          ragResults.forEach((chunk, i) => {
            userContent += `[${i + 1}] (相关度 ${(chunk.score * 100).toFixed(0)}%): ${chunk.chunkText}\n\n`
          })
        }
      } catch {
        // RAG not available, continue without
      }

      // Append checked key points as additional requirements
      const checkedPoints = session.keyPoints.filter(kp => kp.checked)
      if (checkedPoints.length > 0) {
        userContent += '\n\n---\n附加要求 / Additional Requirements:\n'
        checkedPoints.forEach((kp, i) => {
          userContent += `${i + 1}. ${kp.text}\n`
        })
      }

      // Inject folder terminology (本文术语库) — walks up to root folder
      const rootFolderId = (() => {
        const state = useAppStore.getState()
        let fid = session.folderId
        if (!fid) return null
        const folderMap = new Map(state.folders.map(f => [f.id, f.parentId]))
        while (fid) {
          const parent = folderMap.get(fid)
          if (!parent) return fid
          fid = parent
        }
        return fid
      })()
      if (rootFolderId) {
        try {
          const terms = await (window.api as unknown as { getFolderTerminology?: (folderId: string) => Promise<Array<{ term: string; definition?: string }>> }).getFolderTerminology?.(rootFolderId)
          if (terms && terms.length > 0) {
            userContent += '\n\n---\n本文术语库 / Document Terminology:\n'
            terms.forEach((term: { term: string; definition?: string }) => {
              userContent += `- ${term.term}${term.definition ? ': ' + term.definition : ''}\n`
            })
          }
        } catch {
          // Folder terminology not available
        }
      }

      // Inject professional terminology (global)
      try {
        const proTerms = await (window.api as unknown as { getProTerminology?: () => Promise<Array<{ term: string; definition?: string }>> }).getProTerminology?.()
        if (proTerms && proTerms.length > 0) {
          userContent += '\n\n---\n专业术语库 / Professional Terminology:\n'
          proTerms.forEach((term: { term: string; definition?: string }) => {
            userContent += `- ${term.term}${term.definition ? ': ' + term.definition : ''}\n`
          })
        }
      } catch {
        // Professional terminology not available, continue without
      }

      messages.push({ role: 'user', content: userContent })
    } else {
      // For generation — based on keypoints only
      const checkedPoints = session.keyPoints.filter(kp => kp.checked)
      let userContent = ''
      const ragSourceText = checkedPoints.length > 0
        ? checkedPoints.map(kp => kp.text).join('\n')
        : session.inputText

      if (checkedPoints.length === 0) {
        userContent = `请基于以下内容生成专业段落 / Generate professional paragraph based on:\n\n${session.inputText}`
      } else {
        userContent = language === 'zh'
          ? '请基于以下要点生成专业段落：\n\n'
          : 'Generate a professional paragraph based on the following key points:\n\n'
        checkedPoints.forEach((kp, i) => {
          userContent += `${i + 1}. ${kp.text}\n`
        })
      }

      // Inject RAG reference context
      try {
        const ragResults = await window.api.searchSimilar(ragSourceText, 3)
        if (ragResults && ragResults.length > 0) {
          userContent += '\n\n---\n参考材料 / Reference Context:\n'
          ragResults.forEach((chunk, i) => {
            userContent += `[${i + 1}] (相关度 ${(chunk.score * 100).toFixed(0)}%): ${chunk.chunkText}\n\n`
          })
        }
      } catch {
        // RAG not available
      }

      if (checkedPoints.length > 0) {
        userContent += '\n\n---\n附加要求 / Additional Requirements:\n'
        checkedPoints.forEach((kp, i) => {
          userContent += `${i + 1}. ${kp.text}\n`
        })
      }

      // Inject folder terminology (本文术语库) — walks up to root folder
      const rootFolderId = (() => {
        const state = useAppStore.getState()
        let fid = session.folderId
        if (!fid) return null
        const folderMap = new Map(state.folders.map(f => [f.id, f.parentId]))
        while (fid) {
          const parent = folderMap.get(fid)
          if (!parent) return fid
          fid = parent
        }
        return fid
      })()
      if (rootFolderId) {
        try {
          const terms = await (window.api as unknown as { getFolderTerminology?: (folderId: string) => Promise<Array<{ term: string; definition?: string }>> }).getFolderTerminology?.(rootFolderId)
          if (terms && terms.length > 0) {
            userContent += '\n\n---\n本文术语库 / Document Terminology:\n'
            terms.forEach((term: { term: string; definition?: string }) => {
              userContent += `- ${term.term}${term.definition ? ': ' + term.definition : ''}\n`
            })
          }
        } catch {
          // Folder terminology not available
        }
      }

      // Inject professional terminology (global) for generation
      try {
        const proTerms = await (window.api as unknown as { getProTerminology?: () => Promise<Array<{ term: string; definition?: string }>> }).getProTerminology?.()
        if (proTerms && proTerms.length > 0) {
          userContent += '\n\n---\n专业术语库 / Professional Terminology:\n'
          proTerms.forEach((term: { term: string; definition?: string }) => {
            userContent += `- ${term.term}${term.definition ? ': ' + term.definition : ''}\n`
          })
        }
      } catch {
        // Professional terminology not available, continue without
      }

      messages.push({ role: 'user', content: userContent })
    }

    return messages
  }, [session, language, settings, getModuleKey])

  // Start polishing
  const handleStart = useCallback(async () => {
    if (!session || !session.inputText.trim() || !window.api || useAppStore.getState().isPolishing) return

    startPolishing()
    const requestId = createRequestId()
    setCurrentRequestId(requestId)

    try {
      const moduleKey = getModuleKey()
      const messages = await buildMessages()
      if (useAppStore.getState().currentRequestId !== requestId) return

      await window.api.startStream({
        messages,
        moduleKey,
        _requestId: requestId
      })
      if (useAppStore.getState().currentRequestId !== requestId) await window.api.abortStream(requestId)
    } catch (error) {
      if (useAppStore.getState().currentRequestId !== requestId) return
      showToast(error instanceof Error ? error.message : 'Failed to start', 'error')
      stopPolishing()
    }
  }, [session, startPolishing, stopPolishing, getModuleKey, buildMessages, setCurrentRequestId, showToast])

  // Stop polishing
  const handleStop = useCallback(async () => {
    const requestId = useAppStore.getState().currentRequestId
    setCurrentRequestId(null)
    const content = useAppStore.getState().streamingContent
    if (content) {
      finalizePolishing(content)
    } else {
      stopPolishing()
    }
    if (requestId && window.api) await window.api.abortStream(requestId)
  }, [setCurrentRequestId, stopPolishing, finalizePolishing])

  const handleFinish = useCallback(() => {
    setFlowTransitionOpen(true)
  }, [setFlowTransitionOpen])

  useEffect(() => {
    const onContinuePolish = () => {
      if (!session?.outputText || isPolishing) return
      handleFinish()
    }

    window.addEventListener('app:continue-polish', onContinuePolish)

    return () => {
      window.removeEventListener('app:continue-polish', onContinuePolish)
    }
  }, [session?.outputText, isPolishing, handleFinish])

  useEffect(() => {
    const onStartPolish = () => {
      if (!session?.inputText?.trim() || isPolishing) return
      void handleStart()
    }
    const onStopPolish = () => {
      if (!isPolishing) return
      void handleStop()
    }

    window.addEventListener('app:start-polish', onStartPolish)
    window.addEventListener('app:stop-polish', onStopPolish)

    return () => {
      window.removeEventListener('app:start-polish', onStartPolish)
      window.removeEventListener('app:stop-polish', onStopPolish)
    }
  }, [session?.inputText, session?.outputText, isPolishing, handleStart, handleStop])

  if (!session) return null

  const hasInput = session.inputText.trim().length > 0

  return (
    <div className="space-y-4">
      {/* Main action buttons */}
      <div className="flex gap-2" data-nav-section="actions">
        {isPolishing ? (
          <button
            onClick={handleStop}
            className="btn-danger flex-1 justify-center"
          >
            <Square size={16} />
            {t.polish.stop}
          </button>
        ) : session.outputText ? (
          <button
            onClick={handleFinish}
            className="btn-primary flex-1 justify-center"
          >
            <CheckCircle2 size={16} />
            {`${t.polish.finishPolish} (${t.shortcuts.continuePolish})`}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!hasInput}
            className="btn-primary flex-1 justify-center"
          >
            <Play size={16} />
            {t.polish.start}
          </button>
        )}
      </div>

      {/* Post-polish actions */}
      {session.outputText && !isPolishing && (
        <div className="flex gap-2">
          <button
            onClick={handleStart}
            disabled={!hasInput}
            className="btn-secondary flex-1 justify-center text-xs py-2"
          >
            <Play size={14} />
            {t.polish.repolish}
          </button>
        </div>
      )}

      {/* Key Points */}
      <div data-nav-section="keypoints">
        <KeyPointsList
          recommendedTerms={recommendedTerms}
          onAcceptTerm={handleAcceptTerm}
          onDismissTerms={() => setRecommendedTerms([])}
        />
      </div>
    </div>
  )
}

/** Key Points management component */
function KeyPointsList(props: {
  recommendedTerms: RecommendedTerm[]
  onAcceptTerm: (index: number) => void
  onDismissTerms: () => void
}) {
  const { t } = useI18n()
  const session = useAppStore(s => {
    const active = s.sessions.find(sess => sess.id === s.activeSessionId)
    return active || null
  })
  const { addKeyPoint, removeKeyPoint, toggleKeyPoint, updateKeyPoint, useLlmKeypoints, setUseLlmKeypoints } = useAppStore()
  const [newPointText, setNewPointText] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editText, setEditText] = React.useState('')

  if (!session) return null

  const handleAddPoint = () => {
    if (!newPointText.trim()) return
    addKeyPoint(newPointText.trim())
    setNewPointText('')
  }

  const handleStartEdit = (id: string, text: string) => {
    setEditingId(id)
    setEditText(text)
  }

  const handleSaveEdit = (id: string) => {
    if (editText.trim()) {
      updateKeyPoint(id, editText.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <h3 className="text-xs font-medium text-surface-600">{t.keyPoints.title}</h3>
          <HelpTooltip text={t.tooltips.keyPoints} />
        </div>
        <span className="text-[10px] text-surface-400">
          {session.keyPoints.filter(kp => kp.checked).length}/{session.keyPoints.length}
        </span>
      </div>


      {session.keyPoints.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
          {session.keyPoints.map(kp => (
            <div
              key={kp.id}
              className="flex items-start gap-1.5 group py-1"
            >
              <button
                onClick={() => toggleKeyPoint(kp.id)}
                className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  kp.checked
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-surface-300 hover:border-primary-400'
                }`}
              >
                {kp.checked && <Check size={10} />}
              </button>

              {editingId === kp.id ? (
                <div className="flex-1 flex gap-1">
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="input-field text-xs py-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(kp.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                  <button onClick={() => handleSaveEdit(kp.id)} className="btn-ghost p-1">
                    <Check size={12} className="text-green-600" />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className={`flex-1 text-xs leading-snug cursor-pointer ${
                      kp.checked ? 'text-surface-700' : 'text-surface-400 line-through'
                    }`}
                    onDoubleClick={() => handleStartEdit(kp.id, kp.text)}
                  >
                    {kp.text}
                  </span>
                  <button
                    onClick={() => removeKeyPoint(kp.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-all"
                  >
                    <X size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {props.recommendedTerms.length > 0 && (
        <div className="mb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-surface-500">{t.keyPoints.recommendedTerms}</p>
            <button onClick={props.onDismissTerms} className="btn-ghost px-1.5 py-0.5 text-[10px]">
              {t.keyPoints.dismissAll}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.recommendedTerms.map((item, index) => (
              <div
                key={`${item.term}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-surface-200 bg-surface-50 px-2 py-1"
                title={item.definition || item.term}
              >
                <span className="text-[10px] text-surface-700">{item.term}</span>
                <button
                  onClick={() => props.onAcceptTerm(index)}
                  className="p-0.5 rounded-full hover:bg-primary-100 text-primary-700 transition-colors"
                >
                  <Plus size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new key point */}
      <div className="flex gap-1.5 mt-2">
        <input
          value={newPointText}
          onChange={(e) => setNewPointText(e.target.value)}
          placeholder={t.keyPoints.placeholder}
          className="input-field text-xs py-1.5"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddPoint()
          }}
        />
        <button
          onClick={handleAddPoint}
          disabled={!newPointText.trim()}
          className="btn-primary py-1.5 px-2"
        >
          <Plus size={13} />
        </button>
        <button
          onClick={() => setUseLlmKeypoints(!useLlmKeypoints)}
          className={`shrink-0 p-1.5 rounded-lg border transition-all duration-150 ${
            useLlmKeypoints
              ? 'border-primary-400 bg-primary-50 text-primary-700'
              : 'border-surface-200 text-surface-400 hover:text-surface-600'
          }`}
          title={t.tooltips.llmParse}
        >
          <Sparkles size={13} />
        </button>
      </div>
    </div>
  )
}
