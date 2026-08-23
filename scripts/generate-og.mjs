/**
 * Genera public/landing/og.png (1200×630): papel crema, el chancho y el
 * wordmark. Renderiza scripts/og.html en el Chromium local y lo captura —
 * mismo mecanismo que capture-demo.mjs, sin servidor.
 * Uso: node scripts/generate-og.mjs
 */
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort()
  if (!dirs.length) { console.error('No hay Chromium: seteá PW_CHROMIUM o npx playwright install chromium'); process.exit(1) }
  return join(base, dirs.at(-1), 'chrome-win64', 'chrome.exe')
}

// El chancho del OG sale de design/brand/chancho.svg (fuente vectorial única),
// rasterizado acá. El intermedio (scripts/chancho-og.png) está gitignoreado:
// se regenera siempre, así nunca queda desactualizado si el SVG cambia.
await sharp('design/brand/chancho.svg').resize(520).png().toFile('scripts/chancho-og.png')

const browser = await chromium.launch({ executablePath: chromiumPath() })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto('file://' + resolve('scripts/og.html').replace(/\\/g, '/'))
await page.waitForTimeout(400)
await page.screenshot({ path: 'public/landing/og.png' })
await browser.close()
console.log('public/landing/og.png generado')
