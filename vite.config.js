import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, join } from 'path';
import { existsSync, createReadStream } from 'fs';
import { lookup } from 'mime-types';

const __dirname = resolve();

export default defineConfig({
  root: 'app',
  plugins: [
    react(),
    {
      name: 'serve-help-assets',
      configureServer(server) {
        // Serve app/src/help/ assets at /help/ in dev (images etc.)
        // Runs before Vite's SPA fallback so files are served as-is
        server.middlewares.use('/help', (req, res, next) => {
          const filePath = join(__dirname, 'app', 'src', 'help', req.url);
          if (existsSync(filePath) && !filePath.endsWith('.md') && !filePath.endsWith('.js')) {
            const mime = lookup(filePath);
            if (mime) res.setHeader('Content-Type', mime);
            createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
  server: {
    port: 5173,
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
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
