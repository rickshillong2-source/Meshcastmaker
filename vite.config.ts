import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project from /Meshcastmaker/, not the domain
  // root, so asset URLs need that prefix baked in for the deployed build.
  // Local dev (npm run dev) is unaffected - it always serves from /.
  base: process.env.GITHUB_PAGES ? '/Meshcastmaker/' : '/',
  plugins: [react()],
})
