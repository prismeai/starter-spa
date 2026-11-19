/**
 * Local development only. `npm run build` does not use Vite: it builds the
 * deployed bundles with esbuild (scripts/build.mjs).
 *
 * `npm run dev:live` proxies /__prisme to your workspace with the token of
 * .env, added here on the server side, so the browser never sees it.
 */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const KIT = path.resolve(__dirname, 'vendor/@prisme.ai/mcp-apps')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'PRISMEAI_')
  const live = process.env.VITE_PRISME_LIVE === 'true'
  if (live && (!env.PRISMEAI_API_URL || !env.PRISMEAI_WORKSPACE_ID || !(env.PRISMEAI_ACCESS_TOKEN || env.PRISMEAI_API_KEY))) {
    throw new Error('npm run dev:live needs PRISMEAI_API_URL, PRISMEAI_WORKSPACE_ID and PRISMEAI_ACCESS_TOKEN (or PRISMEAI_API_KEY) in .env')
  }
  const auth: Record<string, string> = env.PRISMEAI_ACCESS_TOKEN
    ? { Authorization: `Bearer ${env.PRISMEAI_ACCESS_TOKEN}` }
    : env.PRISMEAI_API_KEY ? { 'x-prismeai-api-key': env.PRISMEAI_API_KEY } : {}
  const api = (env.PRISMEAI_API_URL ?? '').replace(/\/$/, '')

  return {
    plugins: [react()],
    resolve: {
      alias: [
        { find: /^@prisme\.ai\/mcp-apps\/(react|boot)$/, replacement: `${KIT}/$1.js` },
        { find: /^@prisme\.ai\/mcp-apps$/, replacement: `${KIT}/index.js` },
        { find: '@', replacement: path.resolve(__dirname, 'src') },
      ],
    },
    server: live
      ? {
          proxy: {
            '/__prisme/webhooks': {
              target: api,
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/__prisme\/webhooks/, `/workspaces/${env.PRISMEAI_WORKSPACE_ID}/webhooks`),
              headers: auth,
            },
            '/__prisme/me': { target: api, changeOrigin: true, rewrite: () => '/me', headers: auth },
          },
        }
      : undefined,
  }
})
