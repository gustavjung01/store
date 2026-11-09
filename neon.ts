import { defineConfig } from '@neon/config/v1'

/** Declare services but deploy only to the approved Neon branch. Never auto-apply on main. */
export default defineConfig({
  auth: true,
  functions: {
    storeapi: { name: 'STORE catalog API', source: 'server/api.ts' },
  },
})
