// Run with the packaged Electron runtime in Node mode; all state stays in a scratch directory.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const NativeDatabase = require('better-sqlite3')
const root = path.resolve(__dirname, '..')
const parent = path.join(root, '.validation')
fs.mkdirSync(parent, { recursive: true })
const scratch = fs.mkdtempSync(path.join(parent, 'database-smoke-'))
let database
try {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, 'src/main/database.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  const load = id => {
    if (id === 'electron') return { app: { getPath: () => scratch } }
    if (id === 'better-sqlite3') return function Database(filename) {
      return new NativeDatabase(filename, { nativeBinding: process.argv[2] })
    }
    return require(id)
  }
  new Function('require', 'module', 'exports', compiled)(load, module, module.exports)
  database = module.exports
  database.initDatabase()
  database.createDocument('test-doc', 'Test document')
  database.addTerm('test-term', 'test-doc', 'test', 'definition')
  assert.equal(database.getTerminology('test-doc').length, 1)
  database.deleteDocument('test-doc')
  assert.equal(database.getTerminology('test-doc').length, 0)
  database.addReferenceArticle('test-article', 'Test', 'Synthetic test text', 'fixture')
  const chunk = { id: 'test-chunk', chunkIndex: 0, chunkText: 'Synthetic test text', embedding: [1, 0] }
  database.saveArticleEmbeddings('test-article', [chunk])
  assert.throws(() => database.saveArticleEmbeddings('test-article', [chunk, chunk]))
  assert.equal(database.getArticleEmbeddings('test-article').length, 1)
  database.deleteReferenceArticle('test-article')
  assert.equal(database.getArticleEmbeddings('test-article').length, 0)
  database.savePolishSession('test-session', 'Test', '{"inputText":"Synthetic text"}')
  database.saveAllFolders([{ id: 'test-folder', name: 'Test', parent_id: null, created_at: 1 }])
  database.closeDatabase()
  database.initDatabase()
  assert.equal(database.getPolishSession('test-session').name, 'Test')
  assert.equal(database.getAllFolders().length, 1)
  database.deletePolishSession('test-session')
  assert.equal(database.getPolishSessions().length, 0)
  console.log('Application database persistence, cascade deletion and transaction rollback passed.')
} finally {
  database?.closeDatabase()
  if (!path.resolve(scratch).startsWith(parent + path.sep)) throw new Error('Unsafe database-test cleanup path')
  fs.rmSync(scratch, { recursive: true, force: true })
}
