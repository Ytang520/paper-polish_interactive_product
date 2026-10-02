/* ===== Shared Types for Paper Polish Application ===== */

export type Language = 'zh' | 'en'
export type PolishScope = 'word' | 'sentence' | 'paragraph'
export type PolishMode = 'refinement' | 'generation'

/** Per-module LLM configuration */
export interface ModuleConfig {
  base_url: string
  api_key: string
  model_name: string
  temperature: number
  max_tokens: number
  reasoning_mode: boolean
  output_language: 'en' | 'zh'
}

/** All configurable LLM modules */
export interface ModuleConfigs {
  word_refinement: ModuleConfig
  sentence_refinement: ModuleConfig
  paragraph_refinement: ModuleConfig
  paragraph_generation: ModuleConfig
  intent_parser: ModuleConfig
  ultra_generator: ModuleConfig
  ultra_evaluator: ModuleConfig
  embedding: ModuleConfig
}

export type ModuleKey = keyof ModuleConfigs

/** Global application settings */
export interface AppSettings {
  language: Language
  theme: 'light' | 'dark'
  modules: ModuleConfigs
  customPrompts: Record<string, string>
  shortcuts: Record<string, string>
}

/** A single polishing key-point extracted from user feedback */
export interface KeyPoint {
  id: string
  text: string
  checked: boolean
}

/** A node in the polishing history tree */
export interface PolishHistoryNode {
  id: string
  text: string
  inputText: string
  timestamp: number
  parentId: string | null
  scope: PolishScope
  mode: PolishMode
}

export interface FolderNode {
  id: string
  name: string
  parentId: string | null
  createdAt: number
}

/** Terminology entry for per-document vocabulary */
export interface TermEntry {
  id: string
  document_id: string
  term: string
  definition: string
  created_at: number
}

/** Reference article for RAG retrieval */
export interface ReferenceArticle {
  id: string
  title: string
  content: string
  source: string
  created_at: number
}

/** Ultra mode evaluation result */
export interface UltraEvaluation {
  scores: {
    professionalism: number
    clarity: number
    logic: number
    naturalFlow: number
    overall: number
  }
  passed: boolean
  feedback: string[]
  summary: string
}

/** Ultra mode iteration record */
export interface UltraIteration {
  iteration: number
  generatedText: string
  evaluation: UltraEvaluation | null
}

/** A polishing session / flow */
export interface PolishSession {
  id: string
  name: string
  createdAt: number
  folderId?: string | null
  inputText: string
  outputText: string
  scope: PolishScope
  mode: PolishMode
  keyPoints: KeyPoint[]
  history: PolishHistoryNode[]
  activeHistoryNodeId: string | null
  documentId: string | null
  terminologyHighlight: boolean
  ultraMode: boolean
  ultraMaxIterations: number
  ultraIterations: UltraIteration[]
}

/** Persisted session summary for sidebar display */
export interface PersistedSessionSummary {
  id: string
  name: string
  created_at: number
  updated_at: number
}

/** LLM streaming request parameters */
export interface StreamRequestParams {
  _requestId?: string
  messages: ChatMessage[]
  moduleKey: ModuleKey
}

/** Chat message format */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  reasoning_content?: string
}

/** Streaming chunk types */
export interface StreamChunkContent {
  type: 'content'
  content: string
}

export interface StreamChunkReasoning {
  type: 'reasoning'
  content: string
}

export interface StreamChunkDone {
  type: 'done'
  finishReason: string
}

export interface StreamChunkError {
  type: 'error'
  message: string
  code?: number
}

export type StreamChunk =
  | StreamChunkContent
  | StreamChunkReasoning
  | StreamChunkDone
  | StreamChunkError

/** Predefined model options */
export interface ModelPreset {
  name: string
  baseUrl: string
  models: string[]
  moduleModels?: Partial<Record<ModuleKey, string[]>>
  managed?: boolean
}

export const COPILOT_BASE_URL = 'http://localhost:8070/v1'

export function getPresetModelsForModule(preset: ModelPreset | undefined, moduleKey: ModuleKey): string[] {
  if (!preset) return []
  return preset.moduleModels?.[moduleKey] ?? preset.models
}

export function isCopilotProvider(baseUrl: string): boolean {
  return baseUrl.trim().replace(/\/$/, '') === COPILOT_BASE_URL
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini']
  },
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  {
    name: 'Anthropic (OpenAI Compatible)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']
  },
  {
    name: 'Qwen (Alibaba)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long']
  },
  {
    name: 'Gemini (Google)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro']
  },
  {
    name: 'Volcengine (Doubao)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-seed-2-0-mini-260215', 'doubao-pro-32k', 'doubao-lite-32k', 'doubao-embedding-vision-251215']
  },
  {
    name: 'GitHub Copilot',
    baseUrl: COPILOT_BASE_URL,
    models: ['gpt-4o', 'gpt-4o-mini'],
    moduleModels: {
      word_refinement: ['gpt-4o', 'gpt-4o-mini'],
      sentence_refinement: ['gpt-4o', 'gpt-4o-mini'],
      paragraph_refinement: ['gpt-4o', 'gpt-4o-mini'],
      paragraph_generation: ['gpt-4o', 'gpt-4o-mini'],
      intent_parser: ['gpt-4o', 'gpt-4o-mini'],
      ultra_generator: ['gpt-4o', 'gpt-4o-mini'],
      ultra_evaluator: ['gpt-4o', 'gpt-4o-mini'],
      embedding: ['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-small-inference']
    },
    managed: true
  }
  ]

/** Default module config */
export const DEFAULT_MODULE_CONFIG: ModuleConfig = {
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model_name: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 4096,
  reasoning_mode: false,
  output_language: 'en'
}

/** Default app settings */
export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh',
  theme: 'light',
  modules: {
    word_refinement: { ...DEFAULT_MODULE_CONFIG, temperature: 0.3 },
    sentence_refinement: { ...DEFAULT_MODULE_CONFIG, temperature: 0.4 },
    paragraph_refinement: { ...DEFAULT_MODULE_CONFIG, temperature: 0.5 },
    paragraph_generation: { ...DEFAULT_MODULE_CONFIG, temperature: 0.8 },
    intent_parser: { ...DEFAULT_MODULE_CONFIG, temperature: 0.2, model_name: 'gpt-4o-mini' },
    ultra_generator: { ...DEFAULT_MODULE_CONFIG, temperature: 0.7, reasoning_mode: true, max_tokens: 8192 },
    ultra_evaluator: { ...DEFAULT_MODULE_CONFIG, temperature: 0.1, model_name: 'gpt-4o' },
    embedding: { ...DEFAULT_MODULE_CONFIG, model_name: 'text-embedding-3-small' }
  },
  customPrompts: {},
  shortcuts: {
    continuePolish: 'Ctrl+Enter',
    startStopPolish: 'Alt+L',
    rename: 'F2',
    newSession: 'Ctrl+N',
    settings: 'Ctrl+,'
  }
}

/** Module display info for settings UI */
export const MODULE_INFO: Record<ModuleKey, { zh: string; en: string; description_zh: string; description_en: string }> = {
  word_refinement: {
    zh: '词汇润色',
    en: 'Word Refinement',
    description_zh: '用于替换词汇/短语为更专业的表达',
    description_en: 'Replace words/phrases with more professional alternatives'
  },
  sentence_refinement: {
    zh: '句子润色',
    en: 'Sentence Refinement',
    description_zh: '优化句子使其更专业、清晰',
    description_en: 'Refine sentences for clarity and professionalism'
  },
  paragraph_refinement: {
    zh: '段落润色',
    en: 'Paragraph Refinement',
    description_zh: '打磨段落使其更精炼、专业',
    description_en: 'Polish paragraphs for eloquence and structure'
  },
  paragraph_generation: {
    zh: '段落生成',
    en: 'Paragraph Generation',
    description_zh: '基于想法/要点生成专业段落',
    description_en: 'Generate professional paragraphs from ideas/bullet points'
  },
  intent_parser: {
    zh: '意图解析',
    en: 'Intent Parser',
    description_zh: '解析用户反馈为可执行的打磨要点',
    description_en: 'Parse user feedback into actionable polishing points'
  },
  ultra_generator: {
    zh: 'Ultra 生成器',
    en: 'Ultra Generator',
    description_zh: 'Ultra模式中负责生成/改写的模型',
    description_en: 'Generator model in Ultra auto-iteration mode'
  },
  ultra_evaluator: {
    zh: 'Ultra 评估器',
    en: 'Ultra Evaluator',
    description_zh: 'Ultra模式中负责评估/打分的模型',
    description_en: 'Evaluator model in Ultra auto-iteration mode'
  },
  embedding: {
    zh: '向量嵌入',
    en: 'Embedding',
    description_zh: '用于参考文章RAG检索的嵌入模型',
    description_en: 'Embedding model for reference article RAG retrieval'
  }
}
