import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // FIX #47: Disable source maps in production to prevent source code exposure
    sourcemap: false,
  },
})
