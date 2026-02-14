import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, renameSync, existsSync, rmSync } from 'fs';
import * as importJobService from '../services/importJobService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }

const upload = multer({ dest: join(getDataDir(), 'uploads_tmp') });

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await importJobService.getAll(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await importJobService.getById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Import job not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    // Create the job first to get an ID
    const jobData = {
      filename: req.file.originalname,
      filePath: '', // set after moving file
      userPrompt: req.body.userPrompt || 'Parse the attached bank statement.',
    };
    const job = await importJobService.create(jobData);

    // Move file to permanent location: DATA_DIR/uploads/{jobId}/
    const uploadDir = join(getDataDir(), 'uploads', job._id);
    mkdirSync(uploadDir, { recursive: true });
    const destPath = join(uploadDir, req.file.originalname);
    renameSync(req.file.path, destPath);

    // Update job with file path
    const { importJobs } = await import('../db/index.js');
    await importJobs.update({ _id: job._id }, { $set: { filePath: destPath } });

    // Fire background processing (no await)
    importJobService.processFile(job._id).catch((err) => {
      console.error(`processFile error for job ${job._id}:`, err);
    });

    const updated = await importJobService.getById(job._id);
    res.status(201).json(updated);
  } catch (err) {
    // Clean up temp file on error
    if (req.file && existsSync(req.file.path)) {
      rmSync(req.file.path, { force: true });
    }
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', upload.single('file'), async (req, res) => {
  try {
    const existing = await importJobService.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Import job not found' });

    // If new file provided and job is failed, re-upload and re-process
    if (req.file && existing.status === 'failed') {
      // Remove old file directory
      if (existing.filePath && existsSync(existing.filePath)) {
        const oldDir = dirname(existing.filePath);
        rmSync(oldDir, { recursive: true, force: true });
      }

      // Move new file
      const uploadDir = join(getDataDir(), 'uploads', req.params.id);
      mkdirSync(uploadDir, { recursive: true });
      const destPath = join(uploadDir, req.file.originalname);
      renameSync(req.file.path, destPath);

      // Update job: new file, reset status
      const { importJobs } = await import('../db/index.js');
      await importJobs.update({ _id: req.params.id }, {
        $set: {
          filePath: destPath,
          filename: req.file.originalname,
          status: 'processing',
          error: null,
          userPrompt: req.body.userPrompt || existing.userPrompt,
          updatedAt: new Date().toISOString(),
        },
      });

      // Fire background processing
      importJobService.processFile(req.params.id).catch((err) => {
        console.error(`processFile error for job ${req.params.id}:`, err);
      });

      const updated = await importJobService.getById(req.params.id);
      return res.json(updated);
    }

    // Clean up temp file if uploaded but not applicable
    if (req.file && existsSync(req.file.path)) {
      rmSync(req.file.path, { force: true });
    }

    // Normal update (userPrompt, etc.)
    const result = await importJobService.update(req.params.id, req.body);
    if (!result) return res.status(404).json({ error: 'Import job not found' });
    res.json(result);
  } catch (err) {
    if (req.file && existsSync(req.file.path)) {
      rmSync(req.file.path, { force: true });
    }
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await importJobService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/abandon', async (req, res) => {
  try {
    const result = await importJobService.abandon(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
