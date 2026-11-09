/**
 * Read a short-lived JWT from the official Better Auth JWT endpoint.
 * Do not read an opaque session cookie, cache a JWT, or trust the SDK's
 * beta token() response (which can be a cached session rather than a JWT).
 */
export async function getNeonAuthJwt(baseUrl: string, request: typeof fetch = fetch): Promise<string> {
  const base = new URL(baseUrl)
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('Neon Auth phải dùng HTTPS')
  }

  const endpoint = new URL(base.toString().replace(/\/+$/, '') + '/token')
  let response: Response
  try {
    response = await request(endpoint.toString(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error('Không kết nối được Neon Auth. Kiểm tra mạng và cookie của trình duyệt')
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('Phiên đăng nhập hết hạn. Hãy đăng xuất rồi đăng nhập lại STORE')
  }
  if (!response.ok) {
    throw new Error('Neon Auth không cấp JWT (HTTP ' + response.status + '). Hãy thử đăng nhập lại')
  }

  let payload: unknown
  try { payload = await response.json() } catch {
    throw new Error('Neon Auth trả về dữ liệu token không hợp lệ')
  }
  const candidate = payload && typeof payload === 'object' && 'token' in payload
    ? (payload as { token?: unknown }).token : null
  if (typeof candidate !== 'string' ||
      candidate.length < 40 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)) {
    throw new Error('Neon Auth chưa trả về JWT hợp lệ. Hãy thử đăng nhập lại')
  }
  return candidate
}
