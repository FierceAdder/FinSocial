import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // :5050 = Express (default; macOS AirPlay often blocks :5000); :9999 = docker nginx
  const backend = env.VITE_DEV_BACKEND || 'http://localhost:5050'

  return {
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ml': { target: backend, changeOrigin: true },
      '/ai': { target: backend, changeOrigin: true },
      '/socket.io': { target: backend, changeOrigin: true, ws: true },
    }
  },
  };
})
