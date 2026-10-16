import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The FastAPI backend (Sports-Classification/backend). `/api` is proxied to it so the browser only
// ever talks to the Vite port: with remote development (SSH + port forwarding) one forwarded port is enough,
// and there are no CORS or mixed-origin issues. Video streaming (Range requests) goes through the proxy too.
const apiProxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8100'
const proxy = { '/api': { target: apiProxyTarget, changeOrigin: true } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { host: true, port: 5173, proxy },
  preview: { host: true, port: 4173, proxy },
})
