import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'github-pages',
  base: '/',
  publicDir: '../public',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    outDir: '../pages-dist',
    emptyOutDir: true,
  },
});
