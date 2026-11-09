import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const app = file('src/App.tsx')
const css = file('src/store-ui.css')
const catalogue = file('src/CatalogManager.tsx')
const manifest = JSON.parse(file('public/manifest.webmanifest'))
const html = file('index.html')

test('PWA has standalone display and viewport-fit safe areas', () => {
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.match(html, /viewport-fit=cover/)
  assert.match(css, /height:100dvh/)
  assert.match(css, /env\(safe-area-inset-bottom/)
  assert.match(css, /overscroll-behavior:contain/)
})

test('mobile shell keeps menu outside scroll content and hides it for field editing', () => {
  assert.ok(app.indexOf('<nav className="mobile-store-nav"') > app.indexOf('</main>'))
  assert.match(css, /\.mobile-store-nav\{display:grid/)
  assert.match(css, /\.app\.is-editing \.mobile-store-nav\{display:none/)
  assert.match(app, /onFocusCapture=/)
  assert.match(app, /onBlurCapture=/)
  assert.match(app, /admin-shortcut/)
  assert.match(css, /\.top-actions>\.admin-shortcut\{display:none/)
})

test('product search does not show fake product and permits explicit result selection', () => {
  assert.match(app, /results\.slice\(0, 6\)\.map/)
  assert.match(app, /setSelectedCode\(item\.companyCode\)/)
  assert.match(app, /product \? <ProductPreview key=\{product\.companyCode\}/)
  assert.match(app, /Thông tin chỉ hiển thị sau khi tìm thấy mã thực tế/)
  assert.match(app, /Không phải tồn realtime/)
  assert.match(app, /formatDate\(product\?\.inventoryUpdatedAt/)
})

test('catalogue editor is modal, keyboard accessible and warns on unsaved edits', () => {
  assert.match(catalogue, /role="dialog" aria-modal="true"/)
  assert.match(catalogue, /event\.key === 'Escape'/)
  assert.match(catalogue, /event\.key !== 'Tab'/)
  assert.match(catalogue, /Thông tin chưa lưu sẽ bị bỏ qua/)
  assert.match(css, /\.catalog-dialog\{width:min\(620px,100%\)/)
  assert.match(css, /\.catalog-dialog\{width:100%;height:100dvh/)
})

test('shared geometry is accessible and status styles remain semantic', () => {
  assert.match(css, /--store-control-height:36px/)
  assert.match(css, /--store-control-height:44px/)
  assert.match(css, /--store-field-height:40px/)
  assert.match(css, /font-size:16px/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(css, /\.stock-empty/)
  assert.match(css, /\.stock-unknown/)
  assert.match(css, /\.stock-available/)
})
