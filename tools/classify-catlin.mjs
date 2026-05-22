// Heuristic classifier for catlin_v2.svg paths.
// Reads tools/out/catlin-paths.json, assigns each path a part-group, and renders:
//   - tools/out/catlin-classified.png : every group in a distinct color
//   - tools/out/catlin-mapping.json   : final {index -> group} mapping
// Run: node tools/classify-catlin.mjs

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const outDir = path.join(__dirname, 'out')

const svg = await fs.readFile(path.join(repoRoot, 'catlin_v2.svg'), 'utf8')
const pathsMeta = JSON.parse(await fs.readFile(path.join(outDir, 'catlin-paths.json'), 'utf8'))

// SVG viewBox: 1177 x 1336
// Face region (cream, idx 1): x 377-739, y 314-547
const FACE = { x0: 377, x1: 739, y0: 314, y1: 547 }
const FACE_CX = (FACE.x0 + FACE.x1) / 2 // ~558

function classify(p) {
  const { index, fill, bbox } = p
  const cx = bbox.x + bbox.w / 2
  const cy = bbox.y + bbox.h / 2
  const insideFace = cx >= FACE.x0 - 20 && cx <= FACE.x1 + 20 && cy >= FACE.y0 - 20 && cy <= FACE.y1 + 60

  if (index === 0) return 'outline-main'
  if (index === 1) return 'face'

  // mouth cluster (small shapes around x~520-600, y~430-490)
  if (cy >= 430 && cy <= 495 && cx >= 510 && cx <= 600 && bbox.w < 90 && bbox.h < 60) {
    if (fill === '#221C1E') return 'mouth-outline'
    return 'mouth-pink'
  }

  // blush cheeks (pink, in face y range, far from center x)
  if ((fill === '#FEA3B5' || fill === '#FECED1') && cy >= 420 && cy <= 500 && (cx < 480 || cx > 660) && bbox.w < 90) {
    return cx < FACE_CX ? 'blush-left' : 'blush-right'
  }

  // eyes (dark, large-ish, in face area, above mouth)
  if (insideFace && cy >= 360 && cy <= 460 && bbox.w >= 30 && bbox.w <= 130 && bbox.h >= 30) {
    if (fill === '#221C1E' || fill === '#2B2631' || fill === '#2E2C38' || fill === '#373645') {
      return cx < FACE_CX ? 'eye-left' : 'eye-right'
    }
    if (fill === '#FFFEFD' || fill === '#FFF2E4' || fill === '#E3DEE6') {
      return cx < FACE_CX ? 'eye-left-shine' : 'eye-right-shine'
    }
  }

  // eyebrows: small dark above eyes (y < 380) within face
  if (insideFace && cy < 380 && bbox.h < 30 && (fill === '#221C1E' || fill === '#2B2631')) {
    return cx < FACE_CX ? 'eyebrow-left' : 'eyebrow-right'
  }

  // whiskers: very thin, dark, in face y range but extending outside x
  if ((fill === '#221C1E' || fill === '#2B2631') && bbox.h < 15 && bbox.w > 40 && cy >= 420 && cy <= 520) {
    return cx < FACE_CX ? 'whiskers-left' : 'whiskers-right'
  }

  // bow on top of head (pink, y < 250)
  if ((fill === '#FEA3B5' || fill === '#F77D8F' || fill === '#FECED1') && cy < 280 && cx > 380 && cx < 750) {
    return 'head-bow'
  }

  // head fur (orange) — top half
  if (fill === '#FDC985' || fill === '#F6BD78' || fill === '#FEE0AF') {
    if (cy < 600) return 'head-fur'
    if (cx > 700 && cy > 500) return 'tail'
    if (cy > 900) return 'leg-fur'
    return 'body-fur'
  }

  // ear inner pink
  if ((fill === '#FEA3B5' || fill === '#FECED1') && cy < 260 && (cx < 420 || cx > 720)) {
    return cx < FACE_CX ? 'ear-inner-left' : 'ear-inner-right'
  }

  // bowtie at neck (pink, y 540-660, central)
  if ((fill === '#FEA3B5' || fill === '#F77D8F') && cy >= 540 && cy <= 680 && cx > 400 && cx < 700) {
    return 'bowtie'
  }

  // bell (gold)
  if (fill === '#FDC118' || fill === '#D78611' || fill === '#EAA016' || fill === '#9C6B36') {
    if (cx > 460 && cx < 660 && cy > 570 && cy < 700) return 'bell'
    if (cx > 700) return 'cupcake'
    return 'gold-misc'
  }

  // hearts on apron (pink)
  if ((fill === '#FEA3B5' || fill === '#F77D8F') && cx > 400 && cx < 700 && cy > 700 && cy < 950) {
    return 'apron-heart'
  }

  // paw beans (pink on bottom/legs, or left arm)
  if ((fill === '#FEA3B5' || fill === '#FECED1' || fill === '#F77D8F') && cy > 950) {
    return 'paw-beans'
  }
  if ((fill === '#FEA3B5' || fill === '#FECED1' || fill === '#F77D8F') && cx < 350 && cy > 750) {
    return 'left-arm-paw'
  }

  // teacup / saucer / cupcake area (right side at tray y~620-720)
  if (cx > 750 && cy > 550 && cy < 800) {
    if (fill === '#FFFEFD' || fill === '#E3DEE6' || fill === '#D2CBDC' || fill === '#BDB3D2' || fill === '#ABA0BB') return 'tray-saucer'
    return 'tray-items'
  }

  // arms: dark, sides, mid-body
  if ((fill === '#2B2631' || fill === '#2E2C38' || fill === '#373645' || fill === '#221C1E') && cy >= 600 && cy <= 950) {
    if (cx < 350) return 'left-arm'
    if (cx > 700) return 'right-arm'
    return 'dress'
  }

  // dress dark colors
  if (fill === '#2B2631' || fill === '#2E2C38' || fill === '#373645' || fill === '#5B5A6E' || fill === '#544F55' || fill === '#5A555A' || fill === '#77717C') {
    if (cy > 1050) return 'boots'
    return 'dress'
  }

  // white apron / lace
  if (fill === '#FFFEFD' || fill === '#FFF2E4') {
    if (cy < 600) return 'collar-lace'
    if (cy > 1050) return 'socks'
    if (cx > 250 && cx < 800 && cy > 700 && cy < 1000) return 'apron'
    return 'lace-trim'
  }

  // purple-grey shadows
  if (fill === '#E3DEE6' || fill === '#D2CBDC' || fill === '#BDB3D2' || fill === '#ABA0BB' || fill === '#C2B8D5' || fill === '#B8B0C9' || fill === '#CCC8CC' || fill === '#E1DBE7') {
    if (cy < 600) return 'collar-shadow'
    if (cy > 1050) return 'boots-shadow'
    return 'apron-shadow'
  }

  // pure black dots
  if (fill === '#010101') return 'detail-dot'

  return 'unclassified'
}

const mapping = pathsMeta.map((p) => ({ ...p, group: classify(p) }))
await fs.writeFile(path.join(outDir, 'catlin-mapping.json'), JSON.stringify(mapping, null, 2))

// group stats
const groups = {}
for (const m of mapping) {
  if (!groups[m.group]) groups[m.group] = []
  groups[m.group].push(m.index)
}
console.log('groups:')
for (const [g, idxs] of Object.entries(groups)) {
  console.log(`  ${g.padEnd(20)} ${idxs.length}`)
}

// build a palette
const groupNames = Object.keys(groups).sort()
const palette = [
  '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6',
  '#bcf60c','#fabebe','#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3',
  '#808000','#ffd8b1','#000075','#808080','#000000','#a5a5a5','#5f0f40','#0f4c5c',
  '#fb6f92','#1b998b','#e63946','#06aed5','#ff9b71','#5e548e','#9f86c0','#d4a373',
  '#264653','#f4a261',
]
const groupColor = Object.fromEntries(groupNames.map((g, i) => [g, palette[i % palette.length]]))
await fs.writeFile(path.join(outDir, 'catlin-group-colors.json'), JSON.stringify(groupColor, null, 2))

// render classified image
const html = `<!doctype html><html><head><style>
html,body{margin:0;background:#222;}
.frame{display:inline-block;padding:20px;}
.frame svg{display:block;width:800px;height:auto;background:white;}
.legend{position:fixed;top:8px;right:8px;background:#000a;color:#fff;font:11px/1.3 monospace;padding:8px;max-width:260px;}
.legend div{display:flex;align-items:center;gap:6px;margin:2px 0;}
.legend span{display:inline-block;width:14px;height:14px;border:1px solid #555;}
</style></head><body>
<div class="frame">${svg}</div>
<div class="legend">${groupNames.map((g) => `<div><span style="background:${groupColor[g]}"></span>${g} (${groups[g].length})</div>`).join('')}</div>
</body></html>`

const browser = await puppeteer.launch({ headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1100, height: 1000, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })

await page.evaluate((args) => {
  const { mapping, groupColor } = args
  const paths = Array.from(document.querySelectorAll('svg path'))
  paths.forEach((p, i) => {
    const g = mapping[i].group
    p.setAttribute('fill', groupColor[g])
    p.setAttribute('stroke', '#000')
    p.setAttribute('stroke-width', '0.5')
  })
}, { mapping, groupColor })

await page.screenshot({ path: path.join(outDir, 'catlin-classified.png'), fullPage: true })
await browser.close()
console.log('wrote catlin-classified.png + catlin-mapping.json')
