import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Không tìm thấy root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Only the public static PWA shell is cached. Private data is never in the SW cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // App still works online even if shell caching is unavailable.
    })
  })
}
