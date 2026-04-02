import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';
import { notebooks } from '../db/index.js';
import { sanitizeTitle } from '../services/notebookGitService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getDataDir() {
  return process.env.DATA_DIR || join(__dirname, '..', '..', 'data');
}

/**
 * Resolve the working directory for a Claude Chat session.
 */
async function resolveCwd(type, id) {
  if (!type || !id) return null;

  if (type === 'daily-plan') {
    const dir = join(getDataDir(), 'daily-plans', id);
    if (existsSync(dir)) return dir;
    return null;
  }

  if (type === 'notebook') {
    const notebook = await notebooks.findOne({ _id: id });
    if (!notebook) return null;
    const dir = join(getDataDir(), 'notebooks', sanitizeTitle(notebook.title));
    if (existsSync(dir)) return dir;
    return null;
  }

  return null;
}

/**
 * Attach Claude Chat WebSocket handler to an HTTP server.
 *
 * Uses the Linux `script` command to wrap Claude CLI in a real PTY
 * so it runs in full interactive mode (no native modules needed).
 */
export function attachClaudeChatWs(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/ws/claude-chat') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');

    const cwd = await resolveCwd(type, id);
    if (!cwd) {
      ws.send(`\r\nError: Could not resolve working directory for ${type}/${id}\r\n`);
      ws.close();
      return;
    }

    const claudeDir = join(cwd, '.claude');
    const hasClaudeDir = existsSync(claudeDir);
    const claudeArgs = hasClaudeDir ? '--continue' : '--init';

    console.log(`[claude-chat] Spawning claude ${claudeArgs} in ${cwd}`);

    // Use `script -qc` to wrap claude in a real PTY (no native modules)
    const child = spawn('script', ['-qc', `claude ${claudeArgs}`, '/dev/null'], {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let alive = true;

    child.stdout.on('data', (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    child.stderr.on('data', (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    child.on('error', (err) => {
      console.error(`[claude-chat] Process error:`, err.message);
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\nError: Failed to start claude: ${err.message}\r\n`);
        ws.close();
      }
    });

    child.on('exit', (code) => {
      alive = false;
      console.log(`[claude-chat] Process exited with code ${code}`);
      if (ws.readyState === ws.OPEN) ws.close();
    });

    ws.on('message', (data) => {
      if (alive && child.stdin.writable) {
        child.stdin.write(typeof data === 'string' ? data : data.toString());
      }
    });

    ws.on('close', () => {
      console.log(`[claude-chat] WebSocket closed, cleaning up`);
      if (alive) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (alive) child.kill('SIGKILL');
        }, 3000);
      }
    });
  });
}
