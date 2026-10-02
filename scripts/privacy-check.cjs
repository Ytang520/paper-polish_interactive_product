const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const labelValues = new Set(['API Key', 'API 密钥', 'Show', 'Hide', '显示', '隐藏'])
const normalize = value => value.replaceAll('\\', '/')

function privateFileReason(file) {
  const name = normalize(file)
  if (/(^|\/)(\.ssh|\.aws|\.azure|\.config|user-data|User Data|browser-profile)(\/|$)/i.test(name)) return 'local account or browser profile'
  if (/(^|\/)(auth\.json|accounts\.json|cookies(?:\..*)?|storage-state\.json|\.git-credentials|\.?netrc|_netrc|Login Data.*|Local State|(?:self|personal)-profile\.[^/]+)$/i.test(name)) return 'login or personal profile data'
  if (/(^|\/)(node_modules|dist|dist-electron|release|output|\.validation|\.local|\.venv|\.uv-cache|\.npm-cache|\.electron-cache|\.electron-builder-cache|\.codex|\.agents|\.vscode|\.idea|tmp|temp|exports|sessions|backups?|backup_[^/]*)(\/|$)/i.test(name)) return 'local/generated directory'
  if (/(^|\/)(config(?:\.temp|\.local)?\.json|settings\.local\.json|github_token|credentials\.json|secrets\.json|\.npmrc|\.pypirc|log\.txt|nul)$/i.test(name)) return 'private runtime or diagnostic file'
  if (/(^|\/)\.env(?:\..*)?$/i.test(name) && !name.endsWith('.env.example')) return 'environment secrets'
  if (/\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$|\.(?:log|bak|pem|key|p12|pfx|keystore|exe|dll|node|asar|zip|7z|map|tsbuildinfo|har)$|\.tar\.gz$/i.test(name)) return 'private data, binary or generated file'
  if (/^test-(?:cdp\.[cm]?js|modules\.mjs)$/.test(name)) return 'local diagnostic script'
  return null
}

function scanContent(file, buffer, { dependency = false } = {}) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const source = data.toString('utf8')
  const findings = []
  const report = (reason, index = 0) => findings.push({ file: normalize(file), line: source.slice(0, index).split('\n').length, reason })
  // Inspect binary strings as well as ordinary text, without printing matched values.
  const home = os.homedir()
  const homeVariants = [home, normalize(home), home.replaceAll('\\', '\\\\')]
  if (homeVariants.some(value => value.length > 5 && (data.includes(Buffer.from(value)) || data.includes(Buffer.from(value, 'utf16le'))))) report('local user home directory')
  if (dependency) return findings
  const patterns = [
    ['personal absolute path', /\b[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[^\r\n'"<>]+|\/(?:Users|home)\/[A-Za-z0-9_.-]+\//gi],
    ['credential token', /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['credentials in URL', /\bhttps?:\/\/[^/\s:@]+:[^/\s@]+@/g],
    ['literal bearer token', /\bBearer [A-Za-z0-9._-]{16,}/g]
  ]
  for (const [reason, expression] of patterns) {
    for (const match of source.matchAll(expression)) report(reason, match.index)
  }
  const credentials = /\b(?:[\w-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)|_authToken)\s*['"]?\s*[:=]\s*(['"`])([^'"`\r\n]+)\1/gi
  for (const match of source.matchAll(credentials)) {
    if (!labelValues.has(match[2])) report('nonempty literal credential', match.index)
  }
  // Dependency metadata can contain upstream authors' public contact addresses.
  if (normalize(file) !== 'package-lock.json') {
    const emails = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g
    for (const match of source.matchAll(emails)) {
      if (!/^(?:users\.noreply\.github\.com|example\.(?:com|org|net))$/i.test(match[1])) report('unreviewed email address', match.index)
    }
  }
  return findings
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options })
}

function withTemporaryGit(callback) {
  const parent = path.join(ROOT, '.validation')
  fs.mkdirSync(parent, { recursive: true })
  const scratch = fs.mkdtempSync(path.join(parent, 'public-index-'))
  try {
    git(['init', '--quiet', '--bare', scratch])
    return callback(['--git-dir', scratch, '--work-tree', ROOT])
  } finally {
    // Only remove the exact temporary directory created above, inside this project.
    const resolved = path.resolve(scratch)
    if (!resolved.startsWith(path.resolve(parent) + path.sep)) throw new Error('Unsafe temporary path')
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}

function listPublicFiles() {
  let projectIsGitRoot = false
  try { projectIsGitRoot = path.resolve(git(['rev-parse', '--show-toplevel']).trim()) === ROOT } catch {}
  const list = prefix => git([...prefix, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  const raw = projectIsGitRoot ? list([]) : withTemporaryGit(list)
  return [...new Set(raw.split('\0').filter(Boolean))].sort()
}

function auditProject() {
  const files = listPublicFiles()
  const findings = []
  for (const file of files) {
    const reason = privateFileReason(file)
    if (reason) findings.push({ file, line: 1, reason })
    const fullPath = path.resolve(ROOT, file)
    if (!fullPath.startsWith(ROOT + path.sep)) throw new Error('File is outside project')
    if (!fs.existsSync(fullPath)) continue
    if (fs.lstatSync(fullPath).isSymbolicLink()) {
      findings.push({ file, line: 1, reason: 'unreviewed symbolic link' })
      continue
    }
    findings.push(...scanContent(file, fs.readFileSync(fullPath)))
  }
  return { files, findings }
}

function auditBundle(appOutDir) {
  const asar = require('@electron/asar')
  const archive = path.join(appOutDir, 'resources', 'app.asar')
  const findings = []
  let count = 0
  for (const raw of asar.listPackage(archive)) {
    const archivePath = raw.replace(/^[\\/]+/, '')
    const file = normalize(archivePath)
    const stat = asar.statFile(archive, archivePath)
    if (stat.files) continue
    count++
    if (/\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$|\.(?:log|bak|map|pdb|ilk|obj)$/i.test(file) || /(^|\/)(config(?:\.temp|\.local)?\.json|github_token|credentials\.json|secrets\.json|\.env(?:\..*)?)$/i.test(file)) {
      findings.push({ file, line: 1, reason: 'private/debug file in application archive' })
    }
    if (!/^(?:dist\/|dist-electron\/|resources\/|node_modules\/|package\.json$)/.test(file)) findings.push({ file, line: 1, reason: 'unexpected application archive entry' })
    findings.push(...scanContent(file, asar.extractFile(archive, archivePath), { dependency: file.startsWith('node_modules/') }))
  }
  const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'))
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  if (manifest.version !== expected.version || manifest.name !== expected.name) findings.push({ file: 'package.json', line: 1, reason: 'bundle version/name mismatch' })
  return { files: count, findings }
}

function assertClean(result) {
  if (result.findings.length) {
    for (const finding of result.findings) console.error(`${finding.file}:${finding.line}: ${finding.reason}`)
    throw new Error(`Privacy check failed (${result.findings.length} findings). Matched values are not displayed.`)
  }
  return result
}

module.exports = { ROOT, git, withTemporaryGit, privateFileReason, scanContent, listPublicFiles, auditProject, auditBundle, assertClean }
if (require.main === module) {
  try {
    const result = process.argv[2] === '--bundle' ? auditBundle(path.resolve(process.argv[3])) : auditProject()
    assertClean(result)
    console.log(`Privacy check passed: ${Array.isArray(result.files) ? result.files.length : result.files} files.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
