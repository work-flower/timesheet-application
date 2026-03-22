import { exec } from 'child_process';
import fs from 'fs';
import { sandboxRoot, validate, resolveCwd } from './consoleSandbox.js';

/**
 * Execute a shell command inside the sandbox.
 *
 * @param {string} command — the command to run
 * @param {string} [cwd]  — current working directory (absolute path, must be within sandbox)
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, cwd: string }>}
 */
export async function execute(command, cwd) {
  // Ensure the sandbox root directory exists
  await fs.promises.mkdir(sandboxRoot, { recursive: true });

  // Resolve the working directory
  const cwdResult = resolveCwd(cwd || sandboxRoot);
  if (!cwdResult.allowed) {
    return { stdout: '', stderr: cwdResult.reason, exitCode: 1, cwd: sandboxRoot };
  }
  const resolvedCwd = cwdResult.resolved;

  // Validate the command
  const validation = validate(command, resolvedCwd);
  if (!validation.allowed) {
    return { stdout: '', stderr: validation.reason, exitCode: 1, cwd: resolvedCwd };
  }

  const trimmed = command.trim();

  // Handle 'cd' as a special case — no child process needed
  if (/^cd(\s|$)/.test(trimmed)) {
    return handleCd(trimmed, resolvedCwd);
  }

  return new Promise((resolve) => {
    exec(trimmed, {
      cwd: resolvedCwd,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HOME: sandboxRoot },
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? (error.code ?? 1) : 0,
        cwd: resolvedCwd,
      });
    });
  });
}

/**
 * Handle `cd` commands by resolving the target path within the sandbox.
 */
function handleCd(command, currentCwd) {
  const parts = command.split(/\s+/);
  const target = parts[1] || sandboxRoot;

  const cwdResult = resolveCwd(
    target.startsWith('/') ? target : `${currentCwd}/${target}`
  );

  if (!cwdResult.allowed) {
    return { stdout: '', stderr: cwdResult.reason, exitCode: 1, cwd: currentCwd };
  }

  // Check that the directory actually exists
  try {
    const stat = fs.statSync(cwdResult.resolved);
    if (!stat.isDirectory()) {
      return { stdout: '', stderr: `cd: not a directory: ${target}`, exitCode: 1, cwd: currentCwd };
    }
  } catch {
    return { stdout: '', stderr: `cd: no such file or directory: ${target}`, exitCode: 1, cwd: currentCwd };
  }

  return { stdout: '', stderr: '', exitCode: 0, cwd: cwdResult.resolved };
}
