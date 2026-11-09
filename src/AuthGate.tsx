import { useCallback, useEffect, useState } from 'react'
import App from './App'
import { authClient, authUrl, storeApiUrl, authenticatedCacheScope } from './auth'
import { downloadCatalog, verifyStoreMembership } from './catalogApi'
import { clearPrivateCache, readAuthorizedSnapshot, storeAuthorizedSnapshot } from './cache'
import { emptySnapshot } from './domain'
import { getNeonAuthJwt } from './authJwt'
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
  const [resetToken, setResetToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('token'),
  )
  const [recoveryView, setRecoveryView] = useState<'login' | 'request' | 'sent' | 'reset'>(
    () => new URLSearchParams(window.location.search).has('token') ? 'reset' : 'login',
  )
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')

  const load = useCallback(async (user: SignedIn) => {
    if (!authClient || !storeApiUrl) return
    setLoading(true)
    setError('')
    // Never show a previously cached role/snapshot until the current session is checked.
    setRole(null)
    setScope(null)
    setSnapshot(emptySnapshot())
    setStatus('')
    try {
      if (!navigator.onLine) throw new Error('Cần kết nối mạng để xác minh tài khoản')
      if (!authUrl) throw new Error('Chưa cấu hình Neon Auth')
      const token = await getNeonAuthJwt(authUrl)
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

  // Better Auth redirects here with a short-lived reset token in the URL.
  // Remove it from browser history immediately; never log or persist it.
  useEffect(() => {
    if (resetToken) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash)
    }
  }, [])

  async function requestReset(event: React.FormEvent) {
    event.preventDefault()
    if (!authClient) return
    setLoading(true)
    setError('')
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: window.location.origin + '/',
      })
      if (result.error) throw new Error(result.error.message || 'Không gửi được email đặt mật khẩu')
      setRecoveryView('sent')
      setRecoveryMessage('Nếu email đã có tài khoản STORE, Neon Auth sẽ gửi đường dẫn đặt mật khẩu. Hãy kiểm tra cả thư mục Spam.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được email đặt mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  async function finishReset(event: React.FormEvent) {
    event.preventDefault()
    if (!authClient || !resetToken) return
    setError('')
    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      setError('Mật khẩu cần ít nhất 8 ký tự và hai lần nhập phải khớp nhau')
      return
    }
    setLoading(true)
    try {
      const result = await authClient.resetPassword({ token: resetToken, newPassword })
      if (result.error) throw new Error(result.error.message || 'Không đặt lại được mật khẩu')
      setResetToken(null)
      setNewPassword('')
      setConfirmPassword('')
      setRecoveryView('login')
      setRecoveryMessage('Mật khẩu đã được cập nhật. Anh có thể đăng nhập STORE.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đặt lại được mật khẩu')
    } finally {
      setLoading(false)
    }
  }

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
    if (!authUrl) throw new Error('Chưa cấu hình Neon Auth')
    const token = await getNeonAuthJwt(authUrl)
    const membership = await verifyStoreMembership(storeApiUrl, token)
    if (membership.role !== 'admin') throw new Error('Tài khoản không còn quyền quản trị')
    return token
  }

  if (checking) return <div className="auth-shell"><div className="auth-panel"><h1>STORE</h1><p>Đang xác minh phiên đăng nhập...</p></div></div>
  if (!authClient || !authUrl || !storeApiUrl) {
    return <div className="auth-shell"><div className="auth-panel"><h1>STORE</h1><p>Chưa cấu hình Neon Auth hoặc STORE API cho môi trường này.</p><p>Không tải dữ liệu doanh nghiệp khi thiếu cấu hình xác thực.</p></div></div>
  }

  if (!signedIn && recoveryView === 'reset') {
    return (
      <main className="auth-shell">
        <form className="auth-panel" onSubmit={(event) => { void finishReset(event) }}>
          <div className="auth-mark">S</div>
          <h1>Đặt mật khẩu STORE</h1>
          <p>Đường dẫn này được gửi đến email đã đăng ký trong Neon Auth.</p>
          <label htmlFor="new-password">Mật khẩu mới</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <label htmlFor="confirm-password">Nhập lại mật khẩu</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={loading || !resetToken}>{loading ? 'Đang lưu...' : 'Lưu mật khẩu mới'}</button>
          <button type="button" className="auth-text-button" onClick={() => { setRecoveryView('request'); setError(''); setResetToken(null) }}>Yêu cầu đường dẫn mới</button>
        </form>
      </main>
    )
  }

  if (!signedIn && (recoveryView === 'request' || recoveryView === 'sent')) {
    return (
      <main className="auth-shell">
        <form className="auth-panel" onSubmit={(event) => { void requestReset(event) }}>
          <div className="auth-mark">S</div>
          <h1>Thiết lập mật khẩu</h1>
          <p>Nhập email Admin STORE để nhận đường dẫn đặt mật khẩu từ Neon Auth.</p>
          <label htmlFor="reset-email">Email</label>
          <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {recoveryMessage && <p className="auth-success" role="status">{recoveryMessage}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi email đặt mật khẩu'}</button>
          <button type="button" className="auth-text-button" onClick={() => { setRecoveryView('login'); setError('') }}>Quay lại đăng nhập</button>
        </form>
      </main>
    )
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
          {recoveryMessage && <p className="auth-success" role="status">{recoveryMessage}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button disabled={loading} className="auth-submit" type="submit">{loading ? 'Đang xác minh...' : 'Đăng nhập'}</button>
          <button className="auth-text-button" type="button" onClick={() => { setRecoveryView('request'); setError(''); setRecoveryMessage('') }}>Chưa có mật khẩu / Quên mật khẩu?</button>
          <small>Không cho đăng ký tự do. Liên hệ quản trị viên để được cấp quyền.</small>
        </form>
      </main>
    )
  }

  // A Better Auth session is not authorization to read STORE inventory.
  // Require a fresh signed JWT AND app_members verification before rendering it.
  if (role === null) {
    return (
      <main className="auth-shell">
        <section className="auth-panel" aria-live="polite">
          <div className="auth-mark">S</div>
          <h1>Đang xác minh quyền STORE</h1>
          <p>{loading ? 'Đang kiểm tra Neon Auth và quyền truy cập danh mục...' : 'Không thể mở dữ liệu khi phiên chưa được xác thực đầy đủ.'}</p>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="button" disabled={loading} onClick={() => { void load(signedIn) }}>
            {loading ? 'Đang xác minh...' : 'Thử kết nối lại'}
          </button>
          <button className="auth-text-button" type="button" disabled={loading} onClick={() => { void signOut() }}>
            Đăng xuất và đăng nhập lại
          </button>
        </section>
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
