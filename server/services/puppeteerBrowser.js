import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

// Chromium executable path. In production (Alpine container) this is
// /usr/bin/chromium-browser; can be overridden via PUPPETEER_EXECUTABLE_PATH
// for local development.
export const CHROMIUM_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

// Standard container launch flags. --no-sandbox is required because the
// Chromium sandbox does not work in most container setups; safe here because
// we control all input to the renderer.
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

let browser = null;
let launchPromise = null;

async function launch() {
  const b = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    args: LAUNCH_ARGS,
    headless: 'new',
  });
  // If Chromium crashes or is killed, drop our reference so the next caller
  // re-launches lazily.
  b.on('disconnected', () => {
    if (browser === b) {
      browser = null;
      launchPromise = null;
    }
  });
  return b;
}

/**
 * Returns the singleton Puppeteer browser, launching it lazily on first use.
 * Multiple concurrent callers share the same launch promise.
 */
export async function getBrowser() {
  if (browser && browser.connected) return browser;
  if (!launchPromise) {
    launchPromise = launch()
      .then((b) => {
        browser = b;
        return b;
      })
      .catch((err) => {
        launchPromise = null;
        throw err;
      });
  }
  return launchPromise;
}

/**
 * Closes the singleton browser if it is running. Safe to call multiple times.
 */
export async function closeBrowser() {
  const b = browser;
  browser = null;
  launchPromise = null;
  if (b) {
    try {
      await b.close();
    } catch {
      // Ignore — best effort cleanup.
    }
  }
}

/**
 * Reports whether the Chromium executable exists on disk. Used by /api/health.
 * Does not launch the browser.
 */
export function isChromiumAvailable() {
  return existsSync(CHROMIUM_PATH);
}
