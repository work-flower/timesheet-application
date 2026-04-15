import { Router } from 'express';
import { basename, join } from 'path';
import multer from 'multer';
import {
  getConfig,
  updateConfig,
  testConnection,
  generateSpeech,
  getDefaults,
  getStatus,
  saveBackgroundMusic,
  deleteBackgroundMusic,
  getBackgroundMusicPath,
  getBackgroundMusicSettings,
} from '../services/geminiConfigService.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// GET /api/gemini-config
router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/gemini-config
router.put('/', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    res.json(config);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/gemini-config/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/gemini-config/defaults
router.get('/defaults', (req, res) => {
  res.json(getDefaults());
});

// GET /api/gemini-config/status — lightweight check for main app
router.get('/status', async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gemini-config/tts
router.post('/tts', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const wavBuffer = await generateSpeech(text);
    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wavBuffer.length,
    });
    res.send(wavBuffer);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gemini-config/background-music — upload music file
router.post('/background-music', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const config = await saveBackgroundMusic(req.file);
    res.json(config);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/gemini-config/background-music — remove music file
router.delete('/background-music', async (req, res) => {
  try {
    const config = await deleteBackgroundMusic();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gemini-config/background-music/:filename — serve music file
router.get('/background-music/:filename', (req, res) => {
  const filename = basename(req.params.filename);
  const filePath = join(getBackgroundMusicPath(), filename);
  res.sendFile(filePath);
});

// GET /api/gemini-config/background-music-settings — public settings for main app
router.get('/background-music-settings', async (req, res) => {
  try {
    const settings = await getBackgroundMusicSettings();
    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
