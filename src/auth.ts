import { createAuthClient } from '@neondatabase/neon-js/auth'

export const authUrl = import.meta.env.VITE_NEON_AUTH_URL as string | undefined
export const storeApiUrl = import.meta.env.VITE_STORE_API_URL as string | undefined

// Create the client only when the branch's public Auth URL is configured.
export const authClient = authUrl ? createAuthClient(authUrl) : null

/** Scope local cache by the *authenticated* identity and the environment. */
export async function authenticatedCacheScope(userId: string): Promise<string> {
  if (!userId || !authUrl || !storeApiUrl) throw new Error('Chưa có phiên STORE hợp lệ')
  const bytes = new TextEncoder().encode(authUrl + '|' + storeApiUrl + '|' + userId)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}
