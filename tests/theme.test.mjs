import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const html = file('index.html')
const app = file('src/App.tsx')
const themeCss = file('src/store-theme.css')
const entry = file('src/main.tsx')
const manifest = JSON.parse(file('public/manifest.webmanifest'))
const inlineTheme = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]

function initialTheme(saved, systemDark = false, storageThrows = false) {
  const attr = { dataset: {}, style: {} }
  const meta = { color: null, setAttribute(_key, value) { this.color = value } }
  const storage = { getItem(key) {
    assert.equal(key, 'store-theme')
    if (storageThrows) throw new Error('Storage denied')
    return saved
  } }
  const document = { documentElement: attr, querySelector() { return meta } }
  vm.runInNewContext(inlineTheme, { window: { matchMedia: () => ({ matches: systemDark }) }, document, localStorage: storage })
  return { theme: attr.dataset.theme, colorScheme: attr.style.colorScheme, metaColor: meta.color }
}

test('theme applies before main app paint, honoring stored choice and system default', () => {
  assert.ok(inlineTheme)
  assert.ok(html.indexOf('<script>') < html.indexOf('<script type="module"'))
  assert.deepEqual(initialTheme('dark', false), {
    theme: 'dark', colorScheme: 'dark', metaColor: '#0d1118',
  })
  assert.equal(initialTheme('light', true).theme, 'light', 'manual setting overrides OS dark')
  assert.equal(initialTheme(null, true).theme, 'dark')
  assert.equal(initialTheme(null, false).theme, 'light')
  assert.equal(initialTheme(null, true, true).theme, 'dark', 'blocked storage does not break boot')
})

test('header has only STORE brand, centered accessible toggle and logout', () => {
  const header = app.split('<header className="topbar">')[1]?.split('</header>')[0]
  assert.ok(header)
  assert.match(header, /className="top-brand"/)
  assert.match(header, /className="theme-toggle" role="switch" aria-checked=/)
  assert.match(header, /className="top-actions"/)
  assert.match(header, /className="top-logout"/)
  assert.match(header, /onClick=\{toggleTheme\}/)
  assert.doesNotMatch(header, /breadcrumbs|top-status|session-email|admin-shortcut|nhap-excel/)
  assert.match(themeCss, /grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/)
  assert.match(themeCss, /\.theme-toggle\{justify-self:center/)
  assert.match(app, /localStorage\.setItem\('store-theme', next\)/)
})

test('dark palette is low-glare and covers auth, modal, Excel and product surfaces', () => {
  assert.match(entry, /import '\.\/store-theme\.css'/)
  assert.match(themeCss, /:root\[data-theme="dark"\]\{/)
  assert.match(themeCss, /color-scheme:dark/)
  for (const selector of ['.auth-panel','.catalog-dialog','.excel-card','.excel-table-wrap td',
    '.excel-file input','.store-toast','.catalog-form-grid input','.product-image',
    '.mobile-store-nav','.topbar','.packaging-panel','.price-panel']) {
    assert.ok(themeCss.includes(selector), 'Dark override missing for ' + selector)
  }
  const darkOnly = themeCss.slice(themeCss.indexOf('/* Muted Neon-style night palette'))
  assert.doesNotMatch(darkOnly, /background\s*:\s*#(?:fff|ffffff|f8f[a-f0-9]{3})\b/i)
  assert.equal(manifest.background_color, '#0d1118')
  assert.equal(manifest.theme_color, '#0d1118')
})

test('dark main text and canvas have comfortable legibility', () => {
  function luminance(hex) {
    const rgb = hex.match(/[a-f\d]{2}/gi).slice(0, 3).map(chunk => parseInt(chunk, 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
  }
  const ink = luminance('d7dfe8')
  for (const shade of ['0d1118','171f29','202a35']) {
    const bg = luminance(shade)
    assert.ok((ink + .05) / (bg + .05) > 7, 'dark theme text contrast too low')
  }
})
