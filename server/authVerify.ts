import { jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'

/**
 * Neon Managed Better Auth's JWT issuer is the AUTH ORIGIN, not the full
 * NEON_AUTH_BASE_URL pathname. The Managed JWT contract does not require an
 * audience equal to the auth origin. Never disable signature/time checking.
 */
export function neonAuthIssuer(authBaseUrl: string): string {
  const url = new URL(authBaseUrl)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('Neon Auth issuer must use HTTPS')
  }
  return url.origin
}

export async function verifyNeonManagedJwt(
  token: string,
  jwks: JWTVerifyGetKey,
  authBaseUrl: string,
) {
  return jwtVerify(token, jwks, {
    issuer: neonAuthIssuer(authBaseUrl),
    algorithms: ['EdDSA'],
    // Neon Managed Auth does not document a fixed audience for this JWT.
    // The signature, issuer, expiry, and per-user DB authorization are enforced.
  })
}
