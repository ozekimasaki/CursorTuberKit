// Renders catlin_v2.svg to PNGs for visual part identification.
// Outputs:
//   tools/out/catlin-full.png          - full rendering
//   tools/out/catlin-paths.json        - per-path { index, fill, bbox }
//   tools/out/catlin-highlight-*.png   - one image per path with that path highlighted in magenta
//   tools/out/catlin-color-*.png       - one image per fill color group (paths sharing that fill)
// Run: node tools/inspect-catlin.mjs

import puppeteer from 'puppeteer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const svgPath = path.join(repoRoot, 'catlin_v2.svg')
const outDir = path.join(__dirname, 'out')
await fs.mkdir(outDir, { recursive: true })

const svg = await fs.readFile(svgPath, 'utf8')

const html = `<!doctype html><html><head><style>
html,body{margin:0;background:#f5f3ee;}
.frame{display:inline-block;padding:24px;}
.frame svg{display:block;width:600px;height:auto;background:white;}
.label{font:14px/1.2 monospace;color:#333;margin-bottom:8px;}
</style></head><body>
<div class="frame"><div class="label" id="lab">full</div>${svg}</div>
</body></html>`

const browser = await puppeteer.launch({ headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 720, height: 900, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })

// 1) full render
await page.screenshot({ path: path.join(outDir, 'catlin-full.png'), fullPage: true })

// 2) extract per-path data
const pathData = await page.evaluate(() => {
  const paths = Array.from(document.querySelectorAll('svg path'))
  return paths.map((p, i) => {
    const b = p.getBBox()
    return {
      index: i,
      fill: p.getAttribute('fill') || '',
      bbox: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      area: +(b.width * b.height).toFixed(0),
    }
  })
})
await fs.writeFile(path.join(outDir, 'catlin-paths.json'), JSON.stringify(pathData, null, 2))

// 3) color grouping
const byColor = new Map()
for (const p of pathData) {
  if (!byColor.has(p.fill)) byColor.set(p.fill, [])
  byColor.get(p.fill).push(p.index)
}
const colorSummary = Array.from(byColor.entries()).map(([fill, indices]) => ({
  fill, count: indices.length, sampleIndices: indices.slice(0, 8),
}))
await fs.writeFile(path.join(outDir, 'catlin-colors.json'), JSON.stringify(colorSummary, null, 2))

// 4) render one image per color: only paths with that fill visible
for (const [fill, indices] of byColor) {
  const safe = (fill || 'nofill').replace('#', '')
  await page.evaluate((idxSet) => {
    const paths = Array.from(document.querySelectorAll('svg path'))
    paths.forEach((p, i) => {
      p.style.opacity = idxSet.includes(i) ? '1' : '0.06'
    })
    document.getElementById('lab').textContent = `color ${idxSet.length} paths`
  }, indices)
  await page.screenshot({ path: path.join(outDir, `catlin-color-${safe}.png`), fullPage: true })
}

// 5) render highlight images (top-N biggest paths individually highlighted)
const sortedByArea = [...pathData].sort((a, b) => b.area - a.area)
const TOP = Math.min(40, sortedByArea.length)
for (let k = 0; k < TOP; k++) {
  const target = sortedByArea[k].index
  await page.evaluate((targetIdx) => {
    const paths = Array.from(document.querySelectorAll('svg path'))
    paths.forEach((p, i) => {
      if (i === targetIdx) {
        p.style.opacity = '1'
        p.setAttribute('data-orig-fill', p.getAttribute('fill') || '')
        p.setAttribute('fill', '#ff00ff')
        p.setAttribute('stroke', '#000')
        p.setAttribute('stroke-width', '2')
      } else {
        p.style.opacity = '0.35'
      }
    })
    document.getElementById('lab').textContent = `highlight idx=${targetIdx}`
  }, target)
  const padded = String(target).padStart(3, '0')
  await page.screenshot({ path: path.join(outDir, `catlin-highlight-${padded}.png`), fullPage: true })
  // restore
  await page.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('svg path'))
    paths.forEach((p) => {
      p.style.opacity = '1'
      const orig = p.getAttribute('data-orig-fill')
      if (orig !== null) { p.setAttribute('fill', orig); p.removeAttribute('data-orig-fill') }
      p.removeAttribute('stroke'); p.removeAttribute('stroke-width')
    })
  })
}

await browser.close()
console.log('done. outputs in tools/out/')
