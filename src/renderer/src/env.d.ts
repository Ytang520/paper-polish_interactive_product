/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    api: {
      // Settings
      getSettings: () => Promise<import('./types').AppSettings>
      setSettings: (settings: import('./types').AppSettings) => Promise<void>
      persistSettings: (settings: import('./types').AppSettings) => Promise<string>
      getConfigPath: () => Promise<string>
      onBeforeClose: (callback: () => void) => () => void
      confirmClose: (saveOptions: { prompts: boolean; apiConfig: boolean; modelParams: boolean }) => Promise<void>
      cancelClose: () => Promise<void>
      getCopilotStatus: () => Promise<{ state: 'idle' | 'connected' | 'started' | 'error'; message: string; connected: boolean }>
      onCopilotStatus: (callback: (status: { state: 'idle' | 'connected' | 'started' | 'error'; message: string; connected: boolean }) => void) => () => void

      // LLM Streaming
      startStream: (params: import('./types').StreamRequestParams) => Promise<string>
      abortStream: (requestId: string) => Promise<void>
      onStreamChunk: (callback: (requestId: string, chunk: import('./types').StreamChunk) => void) => () => void

      // File operations
      exportMarkdown: (content: string, defaultName: string) => Promise<boolean>

      // Terminology
      getTerminology: (documentId: string) => Promise<import('./types').TermEntry[]>
      addTerm: (documentId: string, term: string, definition: string) => Promise<import('./types').TermEntry>
      updateTerm: (id: string, term: string, definition: string) => Promise<void>
      deleteTerm: (id: string) => Promise<void>
      searchTerms: (documentId: string, query: string) => Promise<import('./types').TermEntry[]>

      // Reference Articles
      getReferenceArticles: () => Promise<import('./types').ReferenceArticle[]>
      addReferenceArticle: (title: string, content: string, source: string) => Promise<import('./types').ReferenceArticle>
      updateReferenceArticle: (id: string, title: string, content: string, source: string) => Promise<void>
      deleteReferenceArticle: (id: string) => Promise<void>

      // Embeddings
      embedArticle: (articleId: string) => Promise<void>
      getArticleEmbeddings: (articleId: string) => Promise<unknown[]>
      searchSimilar: (query: string, topK: number) => Promise<{ chunkText: string; score: number }[]>

      // Documents
      getDocuments: () => Promise<{ id: string; name: string; created_at: number; updated_at: number }[]>
      createDocument: (name: string) => Promise<{ id: string; name: string; created_at: number; updated_at: number }>
      deleteDocument: (id: string) => Promise<void>
    }
  }
}
