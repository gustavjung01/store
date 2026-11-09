import { useCallback, useEffect, useState } from 'react'
import App from './App'
import { authClient, authUrl, storeApiUrl, authenticatedCacheScope } from './auth'
import { downloadCatalog, verifyStoreMembership } from './catalogApi'
import { clearPrivateCache, readAuthorizedSnapshot, storeAuthorizedSnapshot } from './cache'
import { emptySnapshot } from './domain'
import type { CatalogSnapshot } from './domain'

type SignedIn = { id: string; email: string }

export default function AuthGate() {
  const [signedIn, setSignedIn] = useState<SignedIn | null>(null)
  const [scope, setScope] = useState<string | null>(null)
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null)
  const [snapshot, setSnapshot] = useState<CatalogSnapshot>(emptySnapshot)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const load = useCallback(async (user: SignedIn) => {
    if (!authClient || !storeApiUrl) return
    setLoading(true)
    setError('')
    try {
      if (!navigator.onLine) throw new Error('Cần kết nối mạng để xác minh tài khoản')
      const tokenResult = await authClient.token()
      const token = tokenResult.data?.token
      if (!token) throw new Error('Không lấy được quyền truy cập dữ liệu STORE')
      const membership = await verifyStoreMembership(storeApiUrl, token)
      setRole(membership.role)
      const cacheId = await authenticatedCacheScope(user.id)
      setScope(cacheId)

      const cached = await readAuthorizedSnapshot(cacheId).catch(() => null)
      if (cached) {
        setSnapshot(cached)
        setStatus('Dữ liệu lưu trên máy · Đồng bộ lần cuối ' + (cached.syncedAt || 'không rõ'))
      }

      const fresh = await downloadCatalog(storeApiUrl, token)
      setSnapshot(fresh)
      setStatus('Đã đồng bộ danh mục · ' + (fresh.syncedAt || ''))
      try {
        await storeAuthorizedSnapshot(cacheId, fresh)
      } catch {
        setStatus('Đã tải dữ liệu · Thiết bị không lưu được cache IndexedDB')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đồng bộ STORE')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!authClient || !storeApiUrl) { setChecking(false); return }
    void authClient.getSession()
      .then((response) => {
        if (cancelled) return
        const user = response.data?.user
        if (user?.id) {
          const current = { id: String(user.id), email: String(user.email || '') }
          setSignedIn(current)
          void load(current)
        }
      })
      .catch(() => { if (!cancelled) setError('Không kiểm tra được phiên đăng nhập') })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [load])

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    if (!authClient) return
    setLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password })
      if (result.error) throw new Error(result.error.message || 'Đăng nhập thất bại')
      const current = await authClient.getSession()
      const user = current.data?.user
      if (!user?.id) throw new Error('Không tạo được phiên đăng nhập')
      const signed = { id: String(user.id), email: String(user.email || '') }
      setSignedIn(signed)
      setPassword('')
      await load(signed)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Đăng nhập thất bại')
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    if (!authClient) return
    setError('')
    try {
      // If cache removal is blocked by another tab, do not pretend logout was complete.
      if (scope) await clearPrivateCache(scope)
      await authClient.signOut()
      setSignedIn(null)
      setRole(null)
      setScope(null)
      setSnapshot(emptySnapshot())
      setStatus('')
      setPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đăng xuất được')
    }
  }

  async function adminToken(): Promise<string> {
    if (!authClient || !storeApiUrl || role !== 'admin') throw new Error('Không có quyền quản trị STORE')
    const response = await authClient.token()
    if (!response.data?.token) throw new Error('Phiên đăng nhập đã hết hạn')
    const membership = await verifyStoreMembership(storeApiUrl,response.data.token)
    if (membership.role !== 'admin') throw new Error('Tài khoản không còn quyền quản trị')
    return response.data.token
  }

  if (checking) return <div className="auth-shell"><div className="auth-panel"><h1>STORE</h1><p>Đang xác minh phiên đăng nhập...</p></div></div>
  if (!authClient || !authUrl || !storeApiUrl) {
    return <div className="auth-shell"><div className="auth-panel"><h1>STORE</h1><p>Chưa cấu hình Neon Auth hoặc STORE API cho môi trường này.</p><p>Không tải dữ liệu doanh nghiệp khi thiếu cấu hình xác thực.</p></div></div>
  }

  if (!signedIn) {
    return (
      <main className="auth-shell">
        <form className="auth-panel" onSubmit={(event) => { void signIn(event) }}>
          <div className="auth-mark">S</div>
          <h1>Đăng nhập STORE</h1>
          <p>Dành cho nhân viên và quản trị viên đã được cấp tài khoản.</p>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="login-password">Mật khẩu</label>
          <input id="login-password" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button disabled={loading} className="auth-submit" type="submit">{loading ? 'Đang xác minh...' : 'Đăng nhập'}</button>
          <small>Không cho đăng ký tự do. Liên hệ quản trị viên để được cấp quyền.</small>
        </form>
      </main>
    )
  }

  return (
    <>
      <App snapshot={snapshot} catalogStatus={status} cacheScope={scope} userEmail={signedIn.email} isLoading={loading} role={role} apiBase={storeApiUrl} getAdminToken={adminToken}
        onReload={() => { void load(signedIn) }} onSignOut={() => { void signOut() }} />
      {error && <div className="session-error" role="alert">{error}<button type="button" onClick={() => { void load(signedIn) }}>Thử lại</button></div>}
    </>
  )
}
