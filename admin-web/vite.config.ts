import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Required when the admin app is served at /admin/ (nginx subpath), not at site root.
  base: '/admin/',
  plugins: [react()],
})
