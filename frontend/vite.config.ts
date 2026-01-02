import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true,
        timeout: 0, // Unlimited
        proxyTimeout: 0, // Unlimited
      },
      '/images': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/videos': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
