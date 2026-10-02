const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const asar = require('@electron/asar')
const { ROOT, scanContent, privateFileReason, auditProject, auditBundle } = require('./privacy-check.cjs')

test('detects arbitrary assigned API credentials without revealing their values', () => {
  const field = ['api', 'key'].join('_')
  const value = ['private', 'credential', 'fixture'].join('-')
  const findings = scanContent('example.ts', `${field}: '${value}'`)
  assert.ok(findings.some(item => item.reason === 'nonempty literal credential'))
  assert.ok(!JSON.stringify(findings).includes(value))
  assert.equal(scanContent('example.ts', `${field}: ''`).length, 0)
})

test('detects Windows personal paths and UTF-16 paths embedded in binaries', () => {
  const windowsPath = ['C:', 'Users', 'private-user', 'config.json'].join('\\')
  assert.ok(scanContent('example.log', windowsPath).length)
  assert.ok(scanContent('native.node', Buffer.from(os.homedir(), 'utf16le'), { dependency: true }).length)
})

test('runtime data and private files remain forbidden even when tracked', () => {
  for (const file of ['config.json', 'config.temp.json', 'nested/github_token', 'state.sqlite-wal', 'release/product.exe', '.env.production', 'backup_before_asar/config.json', 'auth.json', '.git-credentials', 'browser-profile/Preferences', 'User Data/Default/Cookies', 'self-profile.md']) {
    assert.ok(privateFileReason(file), file)
  }
  assert.equal(privateFileReason('package-lock.json'), null)
  assert.equal(privateFileReason('docs/assets/paperpolish-product-intro.png'), null)
})

test('detects prefixed credentials and personal contact data', () => {
  const field = ['OPENAI', 'API', 'KEY'].join('_')
  assert.ok(scanContent('example.ts', `${field} = 'test-value'`).length)
  const email = ['private-person', 'personal-domain.test'].join('@')
  assert.ok(scanContent('notes.md', email).length)
  assert.ok(!JSON.stringify(scanContent('notes.md', email)).includes(email))
})

test('the actual publication file set passes and includes the build essentials', () => {
  const result = auditProject()
  assert.deepEqual(result.findings, [])
  for (const file of ['package.json', 'package-lock.json', '.gitignore', 'src/main/index.ts', '.github/workflows/release.yml']) assert.ok(result.files.includes(file), file)
  assert.ok(result.files.every(file => !privateFileReason(file)))
})

test('inspects nested ASAR entries and rejects bundled user state', async () => {
  const parent = path.join(ROOT, '.validation')
  fs.mkdirSync(parent, { recursive: true })
  const scratch = fs.mkdtempSync(path.join(parent, 'archive-test-'))
  try {
    const input = path.join(scratch, 'input')
    const output = path.join(scratch, 'app')
    const archive = path.join(output, 'resources', 'app.asar')
    fs.mkdirSync(path.join(input, 'dist', 'assets'), { recursive: true })
    fs.mkdirSync(path.dirname(archive), { recursive: true })
    fs.writeFileSync(path.join(input, 'package.json'), JSON.stringify({ name: 'paper-polish', version: require('../package.json').version }))
    fs.writeFileSync(path.join(input, 'dist', 'assets', 'app.js'), 'console.log("ready")')
    await asar.createPackage(input, archive)
    assert.deepEqual(auditBundle(output).findings, [])
    fs.writeFileSync(path.join(input, 'dist', 'state.sqlite'), 'private test fixture')
    await asar.createPackage(input, archive)
    asar.uncache(archive)
    assert.ok(auditBundle(output).findings.some(item => item.reason === 'private/debug file in application archive'))
  } finally {
    if (!path.resolve(scratch).startsWith(path.resolve(parent) + path.sep)) throw new Error('Unsafe test cleanup path')
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})
