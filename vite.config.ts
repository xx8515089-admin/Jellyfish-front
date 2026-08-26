import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizePath = (id: string) => id.replace(/\\/g, '/')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify('0.3.1'),
    __LOCAL_GUO_ASSETS_AVAILABLE__: true,
    __LOCAL_MIXAMO_CHARACTER_AVAILABLE__: true,
    __LOCAL_MIXAMO_ANIMATIONS_AVAILABLE__: true,
  },
  appType: 'spa',
  server: {
    host:"0.0.0.0",
    port: 7788,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = normalizePath(id)

          if (normalizedId.includes('/src/pages/canvas/TapnowStudio/')) {
            return 'canvas-runtime'
          }

          if (normalizedId.includes('/src/pages/directorDesk/runtime/')) {
            return 'director-desk-runtime'
          }

          if (!normalizedId.includes('/node_modules/')) return undefined

          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/react-router-dom/') ||
            normalizedId.includes('/scheduler/') ||
            normalizedId.includes('/zustand/')
          ) {
            return 'vendor-react'
          }

          if (normalizedId.includes('/lucide-react/')) {
            return 'vendor-icons'
          }

          if (normalizedId.includes('/three/') || normalizedId.includes('/ogl/')) {
            return 'vendor-graphics'
          }

          if (
            normalizedId.includes('/@react-three/') ||
            normalizedId.includes('/camera-controls/') ||
            normalizedId.includes('/three-stdlib/')
          ) {
            return 'vendor-director-graphics'
          }

          if (
            normalizedId.includes('/marked/') ||
            normalizedId.includes('/dompurify/') ||
            normalizedId.includes('/jszip/') ||
            normalizedId.includes('/file-saver/')
          ) {
            return 'vendor-canvas'
          }
          return undefined
        },
      },
    },
  },
})
