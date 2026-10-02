/**
 * Embedding Service — handles text chunking, embedding via LLM API, and similarity search.
 * Uses cosine similarity from ml-distance for vector comparison.
 */

import type { ModuleConfig } from '../renderer/src/types'
import {
  getAllEmbeddings,
  saveArticleEmbeddings,
  getReferenceArticle,
  type ArticleEmbeddingRow
} from './database'

/** Split text into chunks for embedding */
function chunkText(text: string, maxChunkSize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = []
  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)

  let currentChunk = ''
  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      // Keep overlap from the end of current chunk
      const words = currentChunk.split(/\s+/)
      const overlapWords = words.slice(-Math.ceil(overlap / 5))
      currentChunk = overlapWords.join(' ') + '\n\n' + para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim())
  }

  // If no chunks from paragraph splitting, split by character count
  if (chunks.length === 0 && text.trim().length > 0) {
    for (let i = 0; i < text.length; i += maxChunkSize - overlap) {
      chunks.push(text.slice(i, i + maxChunkSize))
    }
  }

  return chunks
}

/** Detect if the provider is Volcengine/Doubao based on base_url */
function isVolcengineProvider(baseUrl: string): boolean {
  return baseUrl.includes('volces.com') || baseUrl.includes('volcengine.com')
}

/** Call Volcengine multimodal embedding API */
async function getVolcengineEmbedding(text: string, config: ModuleConfig): Promise<number[]> {
  // Volcengine uses /embeddings/multimodal endpoint with array-of-objects input
  const url = `${config.base_url}/embeddings/multimodal`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`
    },
    body: JSON.stringify({
      model: config.model_name,
      input: [{ type: 'text', text }],
      encoding_format: 'float'
    })
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Volcengine Embedding API error ${response.status}`)
  }

  const result = await response.json() as {
    data: { embedding: number[] } | Array<{ embedding: number[] }>
  }

  // Handle both single-object and array response formats
  if (Array.isArray(result.data)) {
    return result.data[0].embedding
  }
  return result.data.embedding
}

/** Call OpenAI-compatible embedding API */
async function getOpenAIEmbedding(text: string, config: ModuleConfig): Promise<number[]> {
  const response = await fetch(`${config.base_url}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api_key}`
    },
    body: JSON.stringify({
      model: config.model_name,
      input: [text]
    })
  })

  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Embedding API error ${response.status}`)
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>
  }

  return data.data[0].embedding
}

/** Call embedding API to get vector for a text — auto-detects provider */
async function getEmbedding(text: string, config: ModuleConfig): Promise<number[]> {
  if (isVolcengineProvider(config.base_url)) {
    return getVolcengineEmbedding(text, config)
  }
  return getOpenAIEmbedding(text, config)
}

/** Embed all chunks of a reference article */
export async function embedArticle(articleId: string, config: ModuleConfig): Promise<void> {
  const article = getReferenceArticle(articleId)
  if (!article) throw new Error(`Article ${articleId} not found`)

  const chunks = chunkText(article.content)
  const embeddings: { id: string; chunkIndex: number; chunkText: string; embedding: number[] }[] = []

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i], config)
    embeddings.push({
      id: `emb_${articleId}_${i}_${Date.now()}`,
      chunkIndex: i,
      chunkText: chunks[i],
      embedding
    })
  }

  saveArticleEmbeddings(articleId, embeddings)
}

/** Cosine similarity between two vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0
  return dotProduct / denominator
}

/** Search for similar chunks across all embedded articles */
export async function searchSimilarChunks(
  queryText: string,
  config: ModuleConfig,
  topK: number = 3
): Promise<{ chunkText: string; score: number; articleId: string }[]> {
  // Get query embedding
  const queryEmbedding = await getEmbedding(queryText, config)

  // Get all stored embeddings
  const allEmbeddings = getAllEmbeddings()

  if (allEmbeddings.length === 0) return []

  // Compute similarity scores
  const scored = allEmbeddings.map((row: ArticleEmbeddingRow) => {
    const embedding = JSON.parse(row.embedding) as number[]
    const score = cosineSimilarity(queryEmbedding, embedding)
    return {
      chunkText: row.chunk_text,
      score,
      articleId: row.article_id
    }
  })

  // Sort by score descending and take top K
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK)
}
