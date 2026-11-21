import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };

// The production build is emitted into dist/public and served by Fastify on port 5555.
// In development, Vite runs on 5173 and proxies /api to the backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Exposes the package.json version to the UI (shown in the sidebar).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
