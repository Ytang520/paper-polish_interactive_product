const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { path7za } = require('7zip-bin')
const { ROOT, auditBundle, assertClean } = require('./privacy-check.cjs')
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

module.exports = function verifyPortable(executable, appOutDir) {
  const parent = path.join(ROOT, '.validation')
  fs.mkdirSync(parent, { recursive: true })
  const scratch = fs.mkdtempSync(path.join(parent, 'portable-check-'))
  try {
    const listing = execFileSync(path7za, ['l', '-slt', executable], { encoding: 'utf8', windowsHide: true })
    const entries = listing.split(/\r?\n/).filter(line => line.startsWith('Path = ')).slice(1).map(line => line.slice(7))
    for (const entry of entries) {
      if (/(^|[\\/])(?:config(?:\.temp|\.local)?\.json|github_token|\.env(?:\..*)?)$|\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$|\.(?:log|bak|map|pdb)$/i.test(entry)) throw new Error('Private/debug file in portable payload.')
    }
    execFileSync(path7za, ['x', '-y', '-bso0', `-o${scratch}`, executable, 'resources/app.asar', 'resources/app.asar.unpacked/*'], { windowsHide: true, stdio: 'pipe' })
    assertClean(auditBundle(scratch))
    const resources = ['resources/app.asar', 'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node']
    for (const relative of resources) {
      if (hash(path.join(scratch, relative)) !== hash(path.join(appOutDir, relative))) throw new Error('Portable payload does not match the reviewed application bundle.')
    }
    // Run the bundled Electron runtime in Node mode; this opens no GUI or user database.
    const smoke = `const Database = require(${JSON.stringify(path.join(ROOT, 'node_modules', 'better-sqlite3'))}); const db = new Database(':memory:', {nativeBinding: ${JSON.stringify(path.join(scratch, resources[1]))}}); if (db.prepare('SELECT 42 AS value').get().value !== 42) process.exit(1); db.close(); console.log('Portable SQLite runtime check passed.');`
    const output = execFileSync(path.join(appOutDir, 'PaperPolish.exe'), ['-e', smoke], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000
    })
    console.log(output.trim())
    const databaseOutput = execFileSync(path.join(appOutDir, 'PaperPolish.exe'), [path.join(ROOT, 'scripts/smoke-database.cjs'), path.join(scratch, resources[1])], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000
    })
    console.log(databaseOutput.trim())
    console.log('Portable executable payload and application version verified.')
  } finally {
    if (!path.resolve(scratch).startsWith(path.resolve(parent) + path.sep)) throw new Error('Unsafe portable-check cleanup path')
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}
