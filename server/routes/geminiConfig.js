import { Router } from 'express';
import { respondError } from '../utils/errors.js';
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

// Two surfaces: feature endpoints (TTS, status, background music playback) are used
// by the MAIN app and stay on /api; config endpoints (API key, test, uploads) are
// backed by the unwrapped gemini-config store, so they live ONLY on the admin
// surface (/admin/api) where the Cloudflare-verified superuser check applies.
const router = Router(); // admin surface — full set
export const geminiFeatureRouter = Router(); // main surface — feature subset

// GET /api/gemini-config
router.get('/', async (req, res) => {
  try {
    const config = await getConfig();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// PUT /api/gemini-config
router.put('/', async (req, res) => {
  try {
    const config = await updateConfig(req.body);
    res.json(config);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// POST /api/gemini-config/test-connection
router.post('/test-connection', async (req, res) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err) {
    console.warn(err.message);
    respondError(res, err, 400);
  }
});

// GET /api/gemini-config/defaults
router.get('/defaults', (req, res) => {
  res.json(getDefaults());
});

// GET /api/gemini-config/status — lightweight check for main app
const statusHandler = async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
};
router.get('/status', statusHandler);
geminiFeatureRouter.get('/status', statusHandler);

// POST /api/gemini-config/tts
const ttsHandler = async (req, res) => {
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
    respondError(res, err, 500);
  }
};
router.post('/tts', ttsHandler);
geminiFeatureRouter.post('/tts', ttsHandler);

// POST /api/gemini-config/background-music — upload music file
router.post('/background-music', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const config = await saveBackgroundMusic(req.file);
    res.json(config);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// DELETE /api/gemini-config/background-music — remove music file
router.delete('/background-music', async (req, res) => {
  try {
    const config = await deleteBackgroundMusic();
    res.json(config);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
});

// GET /api/gemini-config/background-music/:filename — serve music file
const backgroundMusicFileHandler = (req, res) => {
  const filename = basename(req.params.filename);
  const filePath = join(getBackgroundMusicPath(), filename);
  res.sendFile(filePath);
};
router.get('/background-music/:filename', backgroundMusicFileHandler);
geminiFeatureRouter.get('/background-music/:filename', backgroundMusicFileHandler);

// GET /api/gemini-config/background-music-settings — public settings for main app
const backgroundMusicSettingsHandler = async (req, res) => {
  try {
    const settings = await getBackgroundMusicSettings();
    res.json(settings);
  } catch (err) {
    console.error(err.message);
    respondError(res, err, 500);
  }
};
router.get('/background-music-settings', backgroundMusicSettingsHandler);
geminiFeatureRouter.get('/background-music-settings', backgroundMusicSettingsHandler);

export default router;
