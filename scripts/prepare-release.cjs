const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { ROOT, git, withTemporaryGit, auditProject, auditBundle, assertClean } = require('./privacy-check.cjs')

try {
  const { version } = require('../package.json')
  const tag = process.argv[2] || `v${version}`
  if (tag !== `v${version}` || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Release tag must match package.json version.')
  const notes = path.join(ROOT, 'docs', 'releases', `${tag}.md`)
  if (!fs.existsSync(notes)) throw new Error('Release notes are missing.')
  const result = assertClean(auditProject())
  assertClean(auditBundle(path.join(ROOT, 'release', 'win-unpacked')))
  const builtExe = path.join(ROOT, 'release', `PaperPolish-${version}-portable.exe`)
  if (!fs.existsSync(builtExe)) throw new Error('Build the Windows portable executable first: npm run build:win')
  require('./verify-portable.cjs')(builtExe, path.join(ROOT, 'release', 'win-unpacked'))
  const output = path.join(ROOT, 'release', 'assets', tag)
  fs.mkdirSync(output, { recursive: true })
  // The first public release keeps the download filename requested by the product owner.
  const exeName = version === '0.1.0' ? 'PaperPolish-1.0.0-portable.exe' : `PaperPolish-${version}-portable.exe`
  fs.copyFileSync(builtExe, path.join(output, exeName))
  const zipName = `PaperPolish-${tag}-source.zip`
  const tarName = `PaperPolish-${tag}-source.tar.gz`
  withTemporaryGit(prefix => {
    git([...prefix, 'add', '--', ...result.files])
    const tree = git([...prefix, 'write-tree']).trim()
    for (const [format, name] of [['zip', zipName], ['tar.gz', tarName]]) {
      git([...prefix, 'archive', `--format=${format}`, `--prefix=PaperPolish-${version}/`, `--output=${path.join(output, name)}`, tree])
    }
  })
  const sums = [exeName, zipName, tarName].map(name => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex')
    return `${hash}  ${name}`
  }).join('\n') + '\n'
  fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), sums)
  console.log(`Release ${tag} ready in release/assets/${tag}/ (${result.files.length} reviewed source files).`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
