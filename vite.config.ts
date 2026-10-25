import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const base = process.env.VITE_BASE_PATH ?? '/'

/** Dev-only proxy so recipe URL import can fetch HTML without CORS. */
function recipeFetchProxyPlugin(): Plugin {
  return {
    name: 'recipe-fetch-proxy',
    configureServer(server) {
      server.middlewares.use('/api/recipe-fetch', (req, res, next) => {
        void (async () => {
          try {
            const reqUrl = new URL(req.url ?? '', 'http://localhost')
            const target = reqUrl.searchParams.get('url')
            if (!target) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing url query param' }))
              return
            }
            let parsed: URL
            try {
              parsed = new URL(target)
            } catch {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid url' }))
              return
            }
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Only http(s) URLs allowed' }))
              return
            }

            const upstream = await fetch(parsed.toString(), {
              headers: {
                'User-Agent': 'ZenKitchen/1.0 (personal recipe import)',
                Accept: 'text/html,application/xhtml+xml',
              },
              redirect: 'follow',
            })
            const body = await upstream.text()
            res.statusCode = upstream.ok ? 200 : upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ok: upstream.ok,
                status: upstream.status,
                finalUrl: upstream.url,
                html: body,
              }),
            )
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : 'Fetch failed',
              }),
            )
          }
        })().catch(next)
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    recipeFetchProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Zen Kitchen',
        short_name: 'Zen Kitchen',
        description: 'A calm Japanese kitchen notebook for batch cooking',
        theme_color: '#f6f4f1',
        background_color: '#f6f4f1',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        globIgnores: ['**/recipes/**'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
