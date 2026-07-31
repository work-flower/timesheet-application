import { conversations } from '../db/index.js';
import { buildQuery, applySelect, formatResponse } from '../odata.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, appendFileSync } from 'fs';

/**
 * Conversations — the Copilot pane's stateful threads.
 *
 * The DB doc is thin (title, timestamps, lastMessageAt); the message transcript
 * lives on disk at DATA_DIR/conversations/{id}/transcript.jsonl (one JSON message
 * per line, append-friendly for streaming). The collection is pipeline-wrapped:
 * per-user privacy comes from a role pre-filter on createdBy (attribution hooks
 * stamp createdBy automatically), so this service does no ownership filtering of
 * its own. In legacy single-user mode the pipeline bypasses and all is visible.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function getDataDir() { return process.env.DATA_DIR || join(__dirname, '..', '..', 'data'); }
function getConversationsDir() { return join(getDataDir(), 'conversations'); }

// Conversation ids reach these helpers from req.params. NeDB _ids are safe, and
// every caller currently gates on findOne({_id}) first — but validate here as
// defence-in-depth so a crafted id can never escape the conversations directory
// (path traversal) regardless of caller. Rejects anything outside the id charset.
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;
function assertValidId(id) {
  if (typeof id !== 'string' || !VALID_ID.test(id)) {
    throw new Error('Invalid conversation id');
  }
  return id;
}
function getConversationDir(id) { return join(getConversationsDir(), assertValidId(id)); }
function getTranscriptPath(id) { return join(getConversationDir(id), 'transcript.jsonl'); }

export async function getAll(query = {}) {
  const { results, totalCount } = await buildQuery(
    conversations, query, { lastMessageAt: -1 }, {},
  );
  const items = applySelect(results, query.$select);
  return formatResponse(items, totalCount, query.$count === 'true');
}

export async function getById(id) {
  const doc = await conversations.findOne({ _id: id });
  if (!doc) return null;
  return { ...doc, messages: readTranscript(id) };
}

export async function create(data = {}) {
  const now = new Date().toISOString();
  const doc = await conversations.insert({
    title: (data.title && data.title.trim()) || 'New conversation',
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  });
  mkdirSync(getConversationDir(doc._id), { recursive: true });
  return doc;
}

export async function update(id, data) {
  const existing = await conversations.findOne({ _id: id });
  if (!existing) return null;
  const updateData = { updatedAt: new Date().toISOString() };
  if (data.title != null) updateData.title = String(data.title).trim() || existing.title;
  await conversations.update({ _id: id }, { $set: updateData });
  return conversations.findOne({ _id: id });
}

export async function remove(id) {
  const existing = await conversations.findOne({ _id: id });
  if (!existing) return null;
  const removed = await conversations.remove({ _id: id });
  const dir = getConversationDir(id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  return removed;
}

/** Read the full transcript for a conversation (empty array if none). */
export function readTranscript(id) {
  const path = getTranscriptPath(id);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Append one message to the transcript and bump lastMessageAt. Message shape:
 *  { role: 'user'|'assistant', content, agent?, createdAt } */
export async function appendMessage(id, message) {
  mkdirSync(getConversationDir(id), { recursive: true });
  const entry = { createdAt: new Date().toISOString(), ...message };
  appendFileSync(getTranscriptPath(id), JSON.stringify(entry) + '\n');
  await conversations.update(
    { _id: id },
    { $set: { lastMessageAt: entry.createdAt, updatedAt: entry.createdAt } },
  );
  return entry;
}

/** Ensure the conversation exists and belongs to the caller's scope (wrapped read). */
export async function assertVisible(id) {
  return conversations.findOne({ _id: id });
}
