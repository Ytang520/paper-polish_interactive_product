/**
 * SQLite Database Layer — persistent storage for terminology, reference articles, and embeddings.
 * Uses better-sqlite3 for synchronous, fast access.
 * Database file stored in Electron's per-user application-data directory.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let db: Database.Database | null = null

function getStorageDir(): string {
  const baseDir = app.getPath('userData')
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
  return baseDir
}

function getLegacyDbPaths(): string[] {
  const paths = new Set<string>()
  paths.add(path.join(process.cwd(), 'text-polish-data.sqlite'))
  paths.add(path.join(path.dirname(process.execPath), 'text-polish-data.sqlite'))
  return Array.from(paths)
}

function getDbPath(): string {
  return path.join(getStorageDir(), 'text-polish-data.sqlite')
}

function migrateLegacyDatabase(targetPath: string): void {
  if (fs.existsSync(targetPath)) return

  for (const legacyPath of getLegacyDbPaths()) {
    if (legacyPath === targetPath || !fs.existsSync(legacyPath)) continue
    fs.copyFileSync(legacyPath, targetPath)
    break
  }
}

/** Initialize database and create tables if needed */
export function initDatabase(): void {
  const dbPath = getDbPath()
  migrateLegacyDatabase(dbPath)
  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS terminology (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      term TEXT NOT NULL,
      definition TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_terminology_doc ON terminology(document_id);
    CREATE INDEX IF NOT EXISTS idx_terminology_term ON terminology(term);

    CREATE TABLE IF NOT EXISTS professional_terminology (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      definition TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_pro_term ON professional_terminology(term);

    CREATE TABLE IF NOT EXISTS folder_terminology (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL,
      term TEXT NOT NULL,
      definition TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_folder_term_folder ON folder_terminology(folder_id);
    CREATE INDEX IF NOT EXISTS idx_folder_term_term ON folder_terminology(term);

    CREATE TABLE IF NOT EXISTS polish_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS reference_articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS article_embeddings (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_text TEXT NOT NULL,
      embedding TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (article_id) REFERENCES reference_articles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_article ON article_embeddings(article_id);

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)

  // Seed placeholder reference articles if table is empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM reference_articles').get() as { cnt: number }
  if (count.cnt === 0) {
    seedPlaceholderArticles()
  }
}

/** Close the database connection */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ===== Documents =====

export interface DocumentRow {
  id: string
  name: string
  created_at: number
  updated_at: number
}

export function createDocument(id: string, name: string): DocumentRow {
  const now = Date.now()
  getDb().prepare(
    'INSERT INTO documents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(id, name, now, now)
  return { id, name, created_at: now, updated_at: now }
}

export function getDocuments(): DocumentRow[] {
  return getDb().prepare('SELECT * FROM documents ORDER BY updated_at DESC').all() as DocumentRow[]
}

export function deleteDocument(id: string): void {
  getDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
}

export function updateDocumentName(id: string, name: string): void {
  getDb().prepare('UPDATE documents SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id)
}

// ===== Terminology =====

export interface TerminologyRow {
  id: string
  document_id: string
  term: string
  definition: string
  created_at: number
}

export function getTerminology(documentId: string): TerminologyRow[] {
  return getDb().prepare(
    'SELECT * FROM terminology WHERE document_id = ? ORDER BY created_at DESC'
  ).all(documentId) as TerminologyRow[]
}

export function addTerm(id: string, documentId: string, term: string, definition: string): TerminologyRow {
  const now = Date.now()
  // Ensure document exists
  const doc = getDb().prepare('SELECT id FROM documents WHERE id = ?').get(documentId)
  if (!doc) {
    // Auto-create the document
    createDocument(documentId, 'Auto')
  }
  getDb().prepare(
    'INSERT INTO terminology (id, document_id, term, definition, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, documentId, term, definition, now)
  return { id, document_id: documentId, term, definition, created_at: now }
}

export function updateTerm(id: string, term: string, definition: string): void {
  getDb().prepare(
    'UPDATE terminology SET term = ?, definition = ? WHERE id = ?'
  ).run(term, definition, id)
}

export function deleteTerm(id: string): void {
  getDb().prepare('DELETE FROM terminology WHERE id = ?').run(id)
}

export function searchTerms(documentId: string, query: string): TerminologyRow[] {
  return getDb().prepare(
    'SELECT * FROM terminology WHERE document_id = ? AND (term LIKE ? OR definition LIKE ?) ORDER BY created_at DESC'
  ).all(documentId, `%${query}%`, `%${query}%`) as TerminologyRow[]
}

// ===== Professional Terminology (Global) =====

export interface ProTermRow {
  id: string
  term: string
  definition: string
  created_at: number
}

export function getProTerminology(): ProTermRow[] {
  return getDb().prepare('SELECT * FROM professional_terminology ORDER BY created_at DESC').all() as ProTermRow[]
}

export function addProTerm(id: string, term: string, definition: string): ProTermRow {
  const now = Date.now()
  getDb().prepare(
    'INSERT INTO professional_terminology (id, term, definition, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, term, definition, now)
  return { id, term, definition, created_at: now }
}

export function updateProTerm(id: string, term: string, definition: string): void {
  getDb().prepare(
    'UPDATE professional_terminology SET term = ?, definition = ? WHERE id = ?'
  ).run(term, definition, id)
}

export function deleteProTerm(id: string): void {
  getDb().prepare('DELETE FROM professional_terminology WHERE id = ?').run(id)
}

export function searchProTerms(query: string): ProTermRow[] {
  return getDb().prepare(
    'SELECT * FROM professional_terminology WHERE term LIKE ? OR definition LIKE ? ORDER BY created_at DESC'
  ).all(`%${query}%`, `%${query}%`) as ProTermRow[]
}

// ===== Folder Terminology (Per-Folder) =====

export interface FolderTermRow {
  id: string
  folder_id: string
  term: string
  definition: string
  created_at: number
}

export function getFolderTerminology(folderId: string): FolderTermRow[] {
  return getDb().prepare(
    'SELECT * FROM folder_terminology WHERE folder_id = ? ORDER BY created_at DESC'
  ).all(folderId) as FolderTermRow[]
}

export function addFolderTerm(id: string, folderId: string, term: string, definition: string): FolderTermRow {
  const now = Date.now()
  getDb().prepare(
    'INSERT INTO folder_terminology (id, folder_id, term, definition, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, folderId, term, definition, now)
  return { id, folder_id: folderId, term, definition, created_at: now }
}

export function updateFolderTerm(id: string, term: string, definition: string): void {
  getDb().prepare(
    'UPDATE folder_terminology SET term = ?, definition = ? WHERE id = ?'
  ).run(term, definition, id)
}

export function deleteFolderTerm(id: string): void {
  getDb().prepare('DELETE FROM folder_terminology WHERE id = ?').run(id)
}

export function searchFolderTerms(folderId: string, query: string): FolderTermRow[] {
  return getDb().prepare(
    'SELECT * FROM folder_terminology WHERE folder_id = ? AND (term LIKE ? OR definition LIKE ?) ORDER BY created_at DESC'
  ).all(folderId, `%${query}%`, `%${query}%`) as FolderTermRow[]
}

// ===== Polish Sessions =====

export interface PolishSessionRow {
  id: string
  name: string
  data: string
  created_at: number
  updated_at: number
}

export function getPolishSessions(): PolishSessionRow[] {
  return getDb().prepare(
    "SELECT id, name, '' as data, created_at, updated_at FROM polish_sessions ORDER BY updated_at DESC"
  ).all() as PolishSessionRow[]
}

export function getPolishSession(id: string): PolishSessionRow | undefined {
  return getDb().prepare('SELECT * FROM polish_sessions WHERE id = ?').get(id) as PolishSessionRow | undefined
}

export function savePolishSession(id: string, name: string, data: string): void {
  const now = Date.now()
  getDb().prepare(
    `INSERT OR REPLACE INTO polish_sessions (id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, COALESCE((SELECT created_at FROM polish_sessions WHERE id = ?), ?), ?)`
  ).run(id, name, data, id, now, now)
}

export function deletePolishSession(id: string): void {
  getDb().prepare('DELETE FROM polish_sessions WHERE id = ?').run(id)
}

// ===== Folders =====

export interface FolderRow {
  id: string
  name: string
  parent_id: string | null
  created_at: number
}

export function getAllFolders(): FolderRow[] {
  return getDb().prepare('SELECT * FROM folders ORDER BY created_at ASC').all() as FolderRow[]
}

export function saveAllFolders(folders: FolderRow[]): void {
  const d = getDb()
  const deleteAll = d.prepare('DELETE FROM folders')
  const insert = d.prepare('INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)')

  const replaceAll = d.transaction((items: FolderRow[]) => {
    deleteAll.run()
    for (const f of items) {
      insert.run(f.id, f.name, f.parent_id, f.created_at)
    }
  })

  replaceAll(folders)
}

// ===== Reference Articles =====

export interface ReferenceArticleRow {
  id: string
  title: string
  content: string
  source: string
  created_at: number
}

export function getReferenceArticles(): ReferenceArticleRow[] {
  return getDb().prepare('SELECT * FROM reference_articles ORDER BY created_at DESC').all() as ReferenceArticleRow[]
}

export function addReferenceArticle(id: string, title: string, content: string, source: string): ReferenceArticleRow {
  const now = Date.now()
  getDb().prepare(
    'INSERT INTO reference_articles (id, title, content, source, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, title, content, source, now)
  return { id, title, content, source, created_at: now }
}

export function updateReferenceArticle(id: string, title: string, content: string, source: string): void {
  getDb().prepare(
    'UPDATE reference_articles SET title = ?, content = ?, source = ? WHERE id = ?'
  ).run(title, content, source, id)
}

export function deleteReferenceArticle(id: string): void {
  // Cascade will delete embeddings
  getDb().prepare('DELETE FROM reference_articles WHERE id = ?').run(id)
}

export function getReferenceArticle(id: string): ReferenceArticleRow | undefined {
  return getDb().prepare('SELECT * FROM reference_articles WHERE id = ?').get(id) as ReferenceArticleRow | undefined
}

// ===== Article Embeddings =====

export interface ArticleEmbeddingRow {
  id: string
  article_id: string
  chunk_index: number
  chunk_text: string
  embedding: string  // JSON stringified float array
}

export function getArticleEmbeddings(articleId: string): ArticleEmbeddingRow[] {
  return getDb().prepare(
    'SELECT * FROM article_embeddings WHERE article_id = ? ORDER BY chunk_index'
  ).all(articleId) as ArticleEmbeddingRow[]
}

export function getAllEmbeddings(): ArticleEmbeddingRow[] {
  return getDb().prepare(
    'SELECT * FROM article_embeddings ORDER BY article_id, chunk_index'
  ).all() as ArticleEmbeddingRow[]
}

export function saveArticleEmbeddings(articleId: string, chunks: { id: string; chunkIndex: number; chunkText: string; embedding: number[] }[]): void {
  const d = getDb()
  const insert = d.prepare(
    'INSERT INTO article_embeddings (id, article_id, chunk_index, chunk_text, embedding) VALUES (?, ?, ?, ?, ?)'
  )

  const insertMany = d.transaction((items: typeof chunks) => {
    d.prepare('DELETE FROM article_embeddings WHERE article_id = ?').run(articleId)
    for (const chunk of items) {
      insert.run(chunk.id, articleId, chunk.chunkIndex, chunk.chunkText, JSON.stringify(chunk.embedding))
    }
  })

  insertMany(chunks)
}

// ===== Seed Placeholder Articles =====

function seedPlaceholderArticles(): void {
  const placeholders = [
    {
      id: 'sample_academic_01',
      title: '学术论文写作范例 / Academic Writing Sample',
      content: `在当代人工智能研究领域，大语言模型（Large Language Models, LLMs）的发展已经从根本上改变了自然语言处理的范式。本文探讨了基于Transformer架构的预训练语言模型在文本生成任务中的应用与优化策略。

研究表明，通过精心设计的提示工程（Prompt Engineering）和上下文学习（In-context Learning）技术，可以显著提升模型在特定领域文本生成中的质量与精确度。特别是在学术写作场景中，结合领域特定术语库与参考文献语料，能够有效降低模型产生的幻觉（hallucination）现象，提升输出文本的可信度与专业性。

In the field of contemporary artificial intelligence research, the development of Large Language Models (LLMs) has fundamentally transformed the paradigm of natural language processing. This paper explores the application and optimization strategies of Transformer-based pre-trained language models in text generation tasks.

Studies have shown that through carefully designed Prompt Engineering and In-context Learning techniques, the quality and precision of model outputs in domain-specific text generation can be significantly enhanced.`,
      source: 'General Academic Sample'
    },
    {
      id: 'sample_business_01',
      title: '商务报告写作范例 / Business Report Sample',
      content: `第三季度市场分析报告显示，公司在数字化转型战略的推动下，核心业务指标实现了显著增长。营收同比增长23.5%，达到人民币4.87亿元，其中SaaS订阅收入占比首次突破60%，标志着公司商业模式转型取得阶段性成果。

客户留存率维持在95.2%的高位水平，净推荐值（NPS）达到72分，较上一季度提升8个百分点。值得注意的是，企业级客户的平均合同价值（ACV）增长了31%，反映出产品价值获得了市场的充分认可。

The third quarter market analysis report indicates that, driven by the digital transformation strategy, the company has achieved significant growth across core business metrics. Revenue increased 23.5% year-over-year, reaching RMB 487 million, with SaaS subscription revenue surpassing 60% for the first time.`,
      source: 'General Business Sample'
    },
    {
      id: 'sample_technical_01',
      title: '技术文档写作范例 / Technical Documentation Sample',
      content: `系统架构设计文档 v2.1

1. 概述
本系统采用微服务架构设计，基于容器化部署方案，通过Kubernetes实现服务编排与自动伸缩。核心组件包括API网关层、业务逻辑服务层、数据持久化层以及消息队列中间件层。

2. 技术选型
- 服务框架：Spring Boot 3.x + Spring Cloud Gateway
- 数据库：PostgreSQL 15（主库）+ Redis 7.x（缓存层）
- 消息队列：Apache Kafka 3.x
- 容器编排：Kubernetes 1.28
- 监控体系：Prometheus + Grafana + ELK Stack

3. 高可用设计
系统通过多活数据中心部署、数据库主从复制、服务健康检查与自动重启等机制，确保系统可用性达到99.95%的SLA标准。

System Architecture Design Document v2.1 - This system adopts a microservices architecture with containerized deployment, orchestrated through Kubernetes for service management and auto-scaling.`,
      source: 'General Technical Sample'
    }
  ]

  for (const article of placeholders) {
    addReferenceArticle(article.id, article.title, article.content, article.source)
  }
}
