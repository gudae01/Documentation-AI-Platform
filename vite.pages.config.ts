import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'github-pages',
  base: '/Documentation-AI-Platform/',
  publicDir: '../public',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: '../pages-dist',
    emptyOutDir: true,
  },
});
