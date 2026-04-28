// Notebook content encryption — AES-256-GCM with PBKDF2(SHA-256) key derivation.
// All operations run client-side via the browser's built-in Web Crypto API.
// The user's password is never sent to the server.
//
// On-disk file format for encrypted content.md:
//   [magic(4)='NBEN' | salt(16) | iv(12) | ciphertext+gcmTag]
//
// The 4-byte magic prefix lets the server detect encrypted content from disk
// (used to derive the virtual isEncrypted field on API responses).

const MAGIC = new Uint8Array([0x4E, 0x42, 0x45, 0x4E]); // 'NBEN'
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 600_000;

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password');
    this.name = 'WrongPasswordError';
  }
}

export function isEncryptedBlob(bytes) {
  if (!bytes || bytes.byteLength < MAGIC.length) return false;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < MAGIC.length; i++) {
    if (view[i] !== MAGIC[i]) return false;
  }
  return true;
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  );

  const blob = new Uint8Array(MAGIC.length + SALT_BYTES + IV_BYTES + ciphertext.byteLength);
  blob.set(MAGIC, 0);
  blob.set(salt, MAGIC.length);
  blob.set(iv, MAGIC.length + SALT_BYTES);
  blob.set(ciphertext, MAGIC.length + SALT_BYTES + IV_BYTES);
  return blob;
}

export async function decrypt(blob, password) {
  const view = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (!isEncryptedBlob(view)) {
    throw new Error('Not an encrypted notebook blob');
  }
  const salt = view.slice(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = view.slice(MAGIC.length + SALT_BYTES, MAGIC.length + SALT_BYTES + IV_BYTES);
  const ciphertext = view.slice(MAGIC.length + SALT_BYTES + IV_BYTES);

  const key = await deriveKey(password, salt);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new WrongPasswordError();
  }
}
