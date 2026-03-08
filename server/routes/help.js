import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readdirSync, statSync } from 'fs';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const HELP_ROOT = join(__dirname, '..', '..', 'app', 'src', 'help');

// Find a skill folder by name across all help topics.
// Searches src/help/{topic}/skill/{skillFolder}/
function findSkillPath(skillFolder) {
  const topicDirs = readdirSync(HELP_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const topic of topicDirs) {
    const candidate = join(HELP_ROOT, topic.name, 'skill', skillFolder);
    try {
      const stat = statSync(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // not found in this topic, continue
    }
  }
  return null;
}

// GET /api/help/skills/:skillFolder/download
router.get('/skills/:skillFolder/download', (req, res) => {
  const { skillFolder } = req.params;

  // Validate: no path traversal
  if (skillFolder.includes('..') || skillFolder.includes('/') || skillFolder.includes('\\')) {
    return res.status(400).json({ error: 'Invalid skill folder name' });
  }

  const skillPath = findSkillPath(skillFolder);
  if (!skillPath) {
    return res.status(404).json({ error: `Skill "${skillFolder}" not found` });
  }

  // Verify resolved path is under HELP_ROOT
  const resolved = resolve(skillPath);
  if (!resolved.startsWith(resolve(HELP_ROOT))) {
    return res.status(400).json({ error: 'Invalid skill folder name' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${skillFolder}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error(`Failed to create skill zip: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create zip archive' });
    }
  });

  archive.pipe(res);
  archive.directory(skillPath, skillFolder);
  archive.finalize();
});

export default router;
