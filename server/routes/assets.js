import { Router } from 'express';
import { existsSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ASSETS_DIR = join(__dirname, '..', 'assets');
const FONTS_DIR = join(ASSETS_DIR, 'fonts');

const router = Router();

// Serve bundled fonts (TTF only). Used by notebook PDF stylesheet via @font-face.
router.get('/fonts/:filename', (req, res) => {
  const safe = basename(req.params.filename);
  if (extname(safe).toLowerCase() !== '.ttf') {
    return res.status(404).end();
  }
  const filePath = join(FONTS_DIR, safe);
  if (!existsSync(filePath)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

// Serve bundled stylesheets (CSS only). Used by notebook PDF renderer.
router.get('/css/:filename', (req, res) => {
  const safe = basename(req.params.filename);
  if (extname(safe).toLowerCase() !== '.css') {
    return res.status(404).end();
  }
  const filePath = join(ASSETS_DIR, safe);
  if (!existsSync(filePath)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('css');
  res.sendFile(filePath);
});

export default router;
