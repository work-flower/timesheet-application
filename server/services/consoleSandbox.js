import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';

/**
 * Console sandbox configuration.
 * All rules are centralised here so they can be adjusted without
 * touching the execution logic in consoleService.
 */

/** Absolute path that acts as the sandbox root. */
export const sandboxRoot = path.resolve(DATA_DIR, 'notebooks');

/**
 * Commands that are completely blocked (matched against the first token).
 */
export const blockedCommands = [
  'shutdown',
  'reboot',
  'poweroff',
  'halt',
  'init',
  'systemctl',
  'service',
  'kill',
  'killall',
  'pkill',
  'mkfs',
  'fdisk',
  'mount',
  'umount',
  'dd',
  'passwd',
  'useradd',
  'userdel',
  'groupadd',
  'chown',
  'chmod',
  'su',
  'sudo',
  'node',
  'npm',
  'npx',
  'python',
  'python3',
  'perl',
  'ruby',
  'curl',
  'wget',
  'nc',
  'ncat',
  'telnet',
  'ssh',
  'scp',
  'rsync',
];

/**
 * Regex patterns tested against the full command string.
 * If any pattern matches the command is rejected.
 */
export const blockedPatterns = [
  /rm\s+(-[a-zA-Z]*)?r[a-zA-Z]*f/,   // rm -rf variants
  /rm\s+(-[a-zA-Z]*)?f[a-zA-Z]*r/,   // rm -fr variants
  />\s*\/dev\//,                        // writes to /dev/
  /\|\s*sh\b/,                          // piping into sh
  /\|\s*bash\b/,                        // piping into bash
  /`[^`]+`/,                            // backtick command substitution
  /\$\([^)]+\)/,                        // $() command substitution
];

/**
 * Validate a command before execution.
 *
 * @param {string} command  — the raw command string
 * @param {string} cwd      — the resolved absolute working directory
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validate(command, cwd) {
  if (!command || !command.trim()) {
    return { allowed: false, reason: 'Empty command' };
  }

  const trimmed = command.trim();

  // Extract the first token (the program name)
  const firstToken = trimmed.split(/\s+/)[0].toLowerCase();

  // Check blocked commands
  if (blockedCommands.includes(firstToken)) {
    return { allowed: false, reason: `Command '${firstToken}' is not allowed` };
  }

  // Check blocked patterns
  for (const pattern of blockedPatterns) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: 'Command matches a blocked pattern' };
    }
  }

  // Verify cwd is within sandbox
  const cwdCheck = resolveCwd(cwd);
  if (!cwdCheck.allowed) {
    return cwdCheck;
  }

  return { allowed: true };
}

/**
 * Resolve and validate a working directory path.
 * Returns the resolved absolute path if it is within the sandbox root.
 *
 * @param {string} requestedCwd — absolute or relative path
 * @returns {{ allowed: boolean, resolved?: string, reason?: string }}
 */
export function resolveCwd(requestedCwd) {
  if (!requestedCwd) {
    return { allowed: true, resolved: sandboxRoot };
  }

  const resolved = path.resolve(sandboxRoot, requestedCwd);

  // Must be the sandbox root itself or a child of it
  if (resolved !== sandboxRoot && !resolved.startsWith(sandboxRoot + path.sep)) {
    return { allowed: false, reason: 'Path is outside the sandbox' };
  }

  return { allowed: true, resolved };
}

/**
 * Human-readable description of the current sandbox rules.
 * Keep this in sync when adding or removing rules above.
 *
 * @returns {{ sandboxRoot: string, sections: Array<{ title: string, items: string[] }> }}
 */
export function describe() {
  return {
    sandboxRoot,
    sections: [
      {
        title: 'Allowed',
        items: [
          'Git — git init, add, commit, push, pull, log, diff, branch, checkout, remote, status, etc.',
          'File browsing — ls, cat, head, tail, find, wc, du, tree, file, stat',
          'File editing — mkdir, touch, cp, mv, rm (single files), echo, tee',
          'Text processing — grep, sed, awk, sort, uniq, cut, tr, diff',
        ],
      },
      {
        title: 'Blocked',
        items: [
          'System — shutdown, reboot, kill, mount, systemctl, passwd, sudo, su',
          'Runtimes — node, npm, python, perl, ruby',
          'Network — curl, wget, ssh, scp, telnet, rsync',
          'Destructive patterns — rm -rf, writes to /dev/, piping into sh/bash',
          'Command substitution — backticks and $()',
        ],
      },
      {
        title: 'Navigation',
        items: [
          'cd <dir> — move within the sandbox (cannot escape notebooks root)',
          'Path traversal (../) that escapes the sandbox is blocked',
        ],
      },
      {
        title: 'Tips',
        items: [
          'clear — clear the screen (or Ctrl+L)',
          'Up/Down arrows — command history',
          'Ctrl+C — cancel current input',
          'Commands time out after 30 seconds',
        ],
      },
    ],
  };
}
