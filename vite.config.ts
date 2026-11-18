import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The production build is published as a CLIProxyAPI plugin resource page:
 *   GET /v0/resource/plugins/<pluginID>/...
 * Assets therefore must resolve relatively, so `base: './'` is required.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
