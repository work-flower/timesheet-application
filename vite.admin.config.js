import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'admin',
  base: '/admin/',
  plugins: [react()],
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:18001',
        changeOrigin: true,
      },
      '/.well-known': {
        target: 'http://localhost:18001',
        changeOrigin: true,
      },
    },
  },
});
