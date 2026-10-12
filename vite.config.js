import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Runs api/*.js (the Vercel serverless functions) under `npm run dev` too, with
// the server-only keys from .env.local (never exposed to the browser).
function devApi(mode) {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
      server.middlewares.use('/api/prompt-to-tasks', async (req, res) => {
        const { default: handler } = await server.ssrLoadModule('/api/prompt-to-tasks.js')
        await handler(req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(mode)],
  // Honour a PORT set by the host (preview tooling); default stays 5173.
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  // Two pages: index.html is the original design, index-v2.html the redesign.
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        v2: resolve(import.meta.dirname, 'index-v2.html'),
        // The desktop app's small "today" window (see desktop/main.cjs).
        widget: resolve(import.meta.dirname, 'widget.html'),
      },
    },
  },
}))
