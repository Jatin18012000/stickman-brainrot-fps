import { defineConfig } from 'vite';

// Relative base so the built game works from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
