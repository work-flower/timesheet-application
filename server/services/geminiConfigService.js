import geminiConfig from '../db/geminiConfig.js';
import { join, resolve } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';

const dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), 'data'));
const musicDir = join(dataDir, 'gemini-config');
mkdirSync(musicDir, { recursive: true });

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE = 'Zephyr';
const DEFAULT_SYSTEM_PROMPT = `You are a professional text-to-speech reader. Read the provided document aloud in a clear, natural, and well-paced voice. Interpret markdown formatting appropriately — use pauses for headings and list items, skip rendering syntax like asterisks or hash symbols. Focus on delivering the content as a human would naturally read it to a listener.`;

function maskSecret(value) {
  if (!value || value.length <= 4) return value ? '****' : '';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

export async function getConfig() {
  const docs = await geminiConfig.find({});
  const doc = docs[0] || null;
  if (doc && doc.apiKey) {
    return { ...doc, apiKey: maskSecret(doc.apiKey) };
  }
  return doc;
}

export async function updateConfig(data) {
  const now = new Date().toISOString();
  const existing = await geminiConfig.find({});
  const updateData = { ...data, updatedAt: now };
  delete updateData._id;

  // If apiKey contains asterisks, retain existing stored value
  if (updateData.apiKey && updateData.apiKey.includes('*')) {
    if (existing.length > 0 && existing[0].apiKey) {
      updateData.apiKey = existing[0].apiKey;
    }
  } else if (existing.length > 0 && updateData.apiKey !== existing[0].apiKey) {
    // API key changed — reset connection tested status
    updateData.connectionTested = false;
  }

  if (existing.length > 0) {
    delete updateData.createdAt;
    await geminiConfig.update({ _id: existing[0]._id }, { $set: updateData });
    const updated = await geminiConfig.findOne({ _id: existing[0]._id });
    return { ...updated, apiKey: maskSecret(updated.apiKey) };
  } else {
    updateData.createdAt = now;
    const created = await geminiConfig.insert(updateData);
    return { ...created, apiKey: maskSecret(created.apiKey) };
  }
}

export async function getRawConfig() {
  const docs = await geminiConfig.find({});
  if (docs[0]) return docs[0];

  // Auto-seed defaults on first use
  const now = new Date().toISOString();
  const defaults = {
    apiKey: '',
    model: DEFAULT_MODEL,
    voice: DEFAULT_VOICE,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    connectionTested: false,
    preflightSeconds: 5,
    backgroundMusicFilename: null,
    backgroundMusicVolume: 10,
    createdAt: now,
    updatedAt: now,
  };
  return geminiConfig.insert(defaults);
}

export async function testConnection(data) {
  const { GoogleGenAI } = await import('@google/genai');

  // If apiKey is masked, get from stored config
  let apiKey = data.apiKey;
  if (apiKey && apiKey.includes('*')) {
    const stored = await getRawConfig();
    if (stored) apiKey = stored.apiKey;
  }

  if (!apiKey) throw new Error('API key is required');

  const model = data.model || DEFAULT_MODEL;
  const voice = data.voice || DEFAULT_VOICE;

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: 'Say hello.' }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData) throw new Error('No audio data returned — model may not support audio output');

  // Persist successful test
  const config = await getRawConfig();
  await geminiConfig.update({ _id: config._id }, { $set: { connectionTested: true } });

  return { success: true };
}

export async function generateSpeech(text) {
  const config = await getRawConfig();
  if (!config.apiKey) throw new Error('Gemini API key is not configured');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const response = await ai.models.generateContent({
    model: config.model || DEFAULT_MODEL,
    systemInstruction: systemPrompt,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: config.voice || DEFAULT_VOICE },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  if (!part?.inlineData) throw new Error('No audio data returned from Gemini');

  const { data: base64Data, mimeType } = part.inlineData;
  const pcmBuffer = Buffer.from(base64Data, 'base64');
  const wavBuffer = wrapWithWavHeader(pcmBuffer, mimeType);

  return wavBuffer;
}

function parseMimeType(mimeType) {
  const options = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 };

  const [fileType, ...params] = mimeType.split(';').map((s) => s.trim());
  const [, format] = fileType.split('/');

  if (format && format.startsWith('L')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }

  for (const param of params) {
    const [key, value] = param.split('=').map((s) => s.trim());
    if (key === 'rate') options.sampleRate = parseInt(value, 10);
  }

  return options;
}

function wrapWithWavHeader(pcmBuffer, mimeType) {
  const { numChannels, sampleRate, bitsPerSample } = parseMimeType(mimeType);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataLength = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export async function saveBackgroundMusic(file) {
  const config = await getRawConfig();

  // Delete old file if exists
  if (config.backgroundMusicFilename) {
    const oldPath = join(musicDir, config.backgroundMusicFilename);
    if (existsSync(oldPath)) unlinkSync(oldPath);
  }

  const filename = `bg-music-${Date.now()}-${file.originalname}`;
  await writeFile(join(musicDir, filename), file.buffer);

  const now = new Date().toISOString();
  await geminiConfig.update({ _id: config._id }, { $set: { backgroundMusicFilename: filename, updatedAt: now } });
  const updated = await geminiConfig.findOne({ _id: config._id });
  return { ...updated, apiKey: maskSecret(updated.apiKey) };
}

export async function deleteBackgroundMusic() {
  const config = await getRawConfig();
  if (config.backgroundMusicFilename) {
    const filePath = join(musicDir, config.backgroundMusicFilename);
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  const now = new Date().toISOString();
  await geminiConfig.update({ _id: config._id }, { $set: { backgroundMusicFilename: null, updatedAt: now } });
  const updated = await geminiConfig.findOne({ _id: config._id });
  return { ...updated, apiKey: maskSecret(updated.apiKey) };
}

export function getBackgroundMusicPath() {
  return musicDir;
}

export async function getBackgroundMusicSettings() {
  const config = await getRawConfig();
  return {
    hasMusic: !!config.backgroundMusicFilename,
    filename: config.backgroundMusicFilename || null,
    volume: config.backgroundMusicVolume ?? 10,
  };
}

export async function getStatus() {
  const config = await getRawConfig();
  return { ready: !!config.connectionTested, preflightSeconds: config.preflightSeconds ?? 5 };
}

export function getDefaults() {
  return { model: DEFAULT_MODEL, voice: DEFAULT_VOICE, systemPrompt: DEFAULT_SYSTEM_PROMPT };
}

export { DEFAULT_MODEL, DEFAULT_VOICE };
