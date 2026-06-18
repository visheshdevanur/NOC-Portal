import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Base path is controlled by the VITE_BASE_PATH environment variable:
//   Vercel (testing)     → set VITE_BASE_PATH=/ in the Vercel dashboard
//   Apache / mitmysore.in → leave unset; defaults to /nodue/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/nodue/',
  plugins: [react()],
  build: {
    // FIX #47: Disable source maps in production to prevent source code exposure
    sourcemap: false,
  },
})
