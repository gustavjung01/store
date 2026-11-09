import assert from 'node:assert/strict'
import test from 'node:test'
import { getNeonAuthJwt } from '../src/authJwt.ts'

const authUrl = 'https://auth.example.test/store/auth'
const exampleJwt = [
  'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiJmaXh0dXJlIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLmV4YW1wbGUudGVzdC9zdG9yZS9hdXRoIn0',
  'c2lnbmF0dXJlLWZpeHR1cmUtZGF0YS1ub3QtYWN0dWFsbHktc2lnbmVk',
].join('.')

test('fetch official /token from the complete Neon branch auth URL with cookie', async () => {
  let url, options
  const result = await getNeonAuthJwt(authUrl, async (input, init) => {
    url = input
    options = init
    return new Response(JSON.stringify({ token: exampleJwt }), { status: 200 })
  })
  assert.equal(result, exampleJwt)
  assert.equal(url, authUrl + '/token')
  assert.equal(options.method, 'GET')
  assert.equal(options.credentials, 'include')
  assert.equal(options.cache, 'no-store')
  assert.equal(options.redirect, 'error')
})

test('401 is expired session and never authorizes cached data', async () => {
  await assert.rejects(
    () => getNeonAuthJwt(authUrl, async () => new Response('unauthorized', { status: 401 })),
    /Phiên đăng nhập hết hạn/,
  )
})

test('cached session response is NOT accepted as signed JWT', async () => {
  await assert.rejects(
    () => getNeonAuthJwt(authUrl, async () => new Response(JSON.stringify({
      session: { id: 'opaque-session' },
      user: { id: 'fake' },
    }), { status: 200 })),
    /chưa trả về JWT hợp lệ/,
  )
})

test('non-JWT token and server errors do not grant access', async () => {
  await assert.rejects(
    () => getNeonAuthJwt(authUrl, async () => new Response('{"token":"opaque-session"}', { status: 200 })),
    /chưa trả về JWT hợp lệ/,
  )
  await assert.rejects(
    () => getNeonAuthJwt(authUrl, async () => new Response('error', { status: 503 })),
    /HTTP 503/,
  )
})

test('rejects insecure non-local auth host before network', async () => {
  await assert.rejects(() => getNeonAuthJwt('http://bad.example.test/auth', async () => {
    throw new Error('should not request')
  }), /HTTPS/)
})
