import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { getNotebookDir, getContent } from './notebookService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STYLE_PATH = join(__dirname, '..', 'assets', 'notebook-pdf-style.tex');
const FONTS_DIR = join(__dirname, '..', 'assets', 'fonts');

/**
 * Build a notebook PDF buffer from its markdown content using pandoc + LaTeX.
 * Returns { buffer: Buffer }.
 */
export async function buildNotebookPdf(notebookId) {
  const dir = await getNotebookDir(notebookId);
  const rawContent = await getContent(notebookId);
  if (rawContent === null || rawContent === '') throw new Error('Notebook content not found');

  // Strip internal links (URLs starting with /) to plain text for PDF output
  const strippedContent = rawContent.replace(/\[([^\]]+)\]\(\/[^)]*\)/g, '$1');
  const tempContentPath = join(tmpdir(), `notebook-content-${randomBytes(8).toString('hex')}.md`);
  writeFileSync(tempContentPath, strippedContent, 'utf-8');

  const outPath = join(tmpdir(), `notebook-${randomBytes(8).toString('hex')}.pdf`);

  const args = [
    tempContentPath,
    '-f', 'markdown-raw_tex',
    '-o', outPath,
    '--pdf-engine=xelatex',
    '-V', 'geometry:margin=2cm',
    '-V', 'colorlinks=true',
    '-V', 'linkcolor=[HTML]{0078D4}',
    '-V', 'urlcolor=[HTML]{0078D4}',
    '-V', 'citecolor=[HTML]{0078D4}',
    '--resource-path', dir,
  ];

  let tempStylePath = null;
  if (existsSync(STYLE_PATH)) {
    const styleTex = readFileSync(STYLE_PATH, 'utf-8').replace(/FONTSDIR/g, FONTS_DIR);
    tempStylePath = join(tmpdir(), `notebook-style-${randomBytes(8).toString('hex')}.tex`);
    writeFileSync(tempStylePath, styleTex, 'utf-8');
    args.push('--include-in-header', tempStylePath);
  }

  await new Promise((resolve, reject) => {
    const proc = spawn('pandoc', args, { cwd: dir });
    const stderrChunks = [];

    proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    proc.on('close', (code) => {
      if (code !== 0) {
        const msg = Buffer.concat(stderrChunks).toString().slice(0, 500);
        reject(new Error(`pandoc failed: ${msg}`));
        return;
      }
      resolve();
    });

    proc.on('error', (err) => reject(new Error(`pandoc failed: ${err.message}`)));
  });

  const buffer = readFileSync(outPath);
  unlinkSync(outPath);
  unlinkSync(tempContentPath);
  if (tempStylePath) unlinkSync(tempStylePath);
  return { buffer };
}
