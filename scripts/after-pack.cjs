const { auditBundle, assertClean } = require('./privacy-check.cjs')

module.exports = async function afterPack(context) {
  const result = assertClean(auditBundle(context.appOutDir))
  console.log(`Packaged application privacy check passed: ${result.files} files.`)
}
