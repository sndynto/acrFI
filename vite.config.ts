import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Strip all console.* and debugger statements from PRODUCTION builds only.
  // In dev (`npm run dev`, command === 'serve') logs stay visible for you;
  // the deployed build (`vite build`) is clean so public users see nothing.
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
}))
