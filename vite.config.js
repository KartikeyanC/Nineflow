import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
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
})
