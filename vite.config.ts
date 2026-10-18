import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built site works from any path (GitHub Pages project sites, subfolders).
  base: './',
  worker: { format: 'es' },
})
