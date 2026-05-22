// Annotate catlin_v2.svg with data-group + class on each <path>,
// plus single <g id="..."> wrappers around contiguous-by-group runs where useful.
// Writes catlin_v2.svg in-place (run once).
//
// Run: node tools/annotate-catlin.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(__dirname, 'out')

const mapping = JSON.parse(await fs.readFile(path.join(outDir, 'catlin-mapping.json'), 'utf8'))

// manual fixups for unclassified / mis-classified
const fixups = {
  10: 'eye-left',          // small dark dot near left eye
  16: 'whiskers-right',    // dark whisker patch on right
  137: 'boots',            // tiny dot in boot area
  172: 'collar-shadow',    // pink shadow at collar
  180: 'collar-shadow',
  247: 'head-bow',         // white highlight on bow
  254: 'cupcake',          // pink detail near tray
}
for (const [i, g] of Object.entries(fixups)) {
  mapping[Number(i)].group = g
}

// groups that should ALSO get a unique id for direct targeting
const idGroups = new Set([
  'face', 'eye-left', 'eye-right', 'mouth-outline',
  'blush-left', 'blush-right', 'head-bow', 'bell', 'bowtie',
  'tail', 'left-arm', 'right-arm', 'left-arm-paw',
  'outline-main',
])

const svgRaw = await fs.readFile(path.join(repoRoot, 'catlin_v2.svg'), 'utf8')

// Find every <path ...> occurrence in order; the i-th one corresponds to mapping[i]
const pathRegex = /<path\b([^>]*?)\/>/g
let i = 0
const annotated = svgRaw.replace(pathRegex, (full, attrs) => {
  const meta = mapping[i]
  i += 1
  if (!meta) return full
  const group = meta.group
  const className = `catlin-path catlin-${group}`
  let newAttrs = attrs
  // strip any pre-existing class/data-group/id to keep idempotent
  newAttrs = newAttrs.replace(/\s+class="[^"]*"/g, '')
  newAttrs = newAttrs.replace(/\s+data-group="[^"]*"/g, '')
  newAttrs = newAttrs.replace(/\s+data-idx="[^"]*"/g, '')
  newAttrs = newAttrs.replace(/\s+id="catlin-[^"]*"/g, '')
  const idAttr = idGroups.has(group) ? ` id="catlin-${group}-${meta.index}"` : ''
  return `<path${newAttrs} data-idx="${meta.index}" data-group="${group}" class="${className}"${idAttr}/>`
})

if (i !== mapping.length) {
  console.warn(`warn: path count mismatch svg=${i} mapping=${mapping.length}`)
}

await fs.writeFile(path.join(repoRoot, 'catlin_v2.svg'), annotated)
console.log(`annotated ${i} paths in catlin_v2.svg`)
