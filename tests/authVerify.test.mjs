import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { neonAuthIssuer, verifyNeonManagedJwt } from '../server/authVerify.ts'

const branchAuth = 'https://example.neonauth.ap-southeast-1.aws.neon.tech/store/auth'
const issuer = new URL(branchAuth).origin

test('Neon Managed JWT issuer is auth origin, not /store/auth path', () => {
  assert.equal(neonAuthIssuer(branchAuth), issuer)
  assert.notEqual(neonAuthIssuer(branchAuth), branchAuth)
})

test('verifies a signed EdDSA token from origin even when aud differs from origin', async () => {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' })
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'ci-test-key'
  jwk.alg = 'EdDSA'
  const jwks = createLocalJWKSet({ keys: [jwk] })
  const token = await new SignJWT({ role: 'not-authoritative' })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'ci-test-key' })
    .setIssuer(issuer)
    .setAudience('neon-client-default')
    .setSubject('ci-user-id')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)

  const result = await verifyNeonManagedJwt(token, jwks, branchAuth)
  assert.equal(result.payload.sub, 'ci-user-id')

  // Neither issuer mismatch, expiry nor signature tampering may grant access.
  await assert.rejects(() => verifyNeonManagedJwt(token, jwks, 'https://wrong.neonauth.example/store/auth'))
  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: 'EdDSA', kid: 'ci-test-key' })
    .setIssuer(issuer).setSubject('ci-user-id')
    .setIssuedAt(1).setExpirationTime(2).sign(privateKey)
  await assert.rejects(() => verifyNeonManagedJwt(expired, jwks, branchAuth))
  // Changing the LAST base64url character can preserve the decoded signature
  // (unused padding bits). Tamper a middle signature byte instead.
  const [header, payload, signature] = token.split('.')
  const middle = Math.floor(signature.length / 2)
  const corruptedSignature = signature.slice(0, middle)
    + (signature[middle] === 'A' ? 'B' : 'A') + signature.slice(middle + 1)
  const corrupted = [header, payload, corruptedSignature].join('.')
  await assert.rejects(() => verifyNeonManagedJwt(corrupted, jwks, branchAuth))
})

test('does not accept insecure auth issuer', () => {
  assert.throws(() => neonAuthIssuer('http://evil.example/store/auth'), /HTTPS/)
})
