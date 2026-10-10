import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Honour a PORT set by the host (preview tooling); default stays 5173.
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
})
