import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The production build is emitted into dist/public and served by Fastify on port 5555.
// In development, Vite runs on 5173 and proxies /api to the backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: 'static',
  build: {
    outDir: 'dist/public',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5555',
    },
  },
});
