import { join, resolve } from 'path';
import { mkdirSync, unlinkSync, rmSync, existsSync, writeFileSync } from 'fs';
import sharp from 'sharp';
import { expenses } from '../db/index.js';

const dataDir = resolve(process.env.DATA_DIR || join(process.cwd(), 'data'));
const expensesDir = join(dataDir, 'expenses');

function getExpenseDir(expenseId) {
  return join(expensesDir, expenseId);
}

export function getFilePath(expenseId, filename) {
  return join(getExpenseDir(expenseId), filename);
}

export function getThumbnailPath(expenseId, filename) {
  return join(getExpenseDir(expenseId), `thumb_${filename}`);
}

function isImage(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

export async function saveAttachments(expenseId, files) {
  const dir = getExpenseDir(expenseId);
  mkdirSync(dir, { recursive: true });

  const expense = await expenses.findOne({ _id: expenseId });
  if (!expense) throw new Error('Expense not found');

  const newAttachments = [];

  for (const file of files) {
    const ext = file.originalname.split('.').pop();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = join(dir, filename);

    // Write original file from buffer
    writeFileSync(filePath, file.buffer);

    // Generate thumbnail for images
    if (isImage(file.mimetype)) {
      try {
        const thumbPath = join(dir, `thumb_${filename}`);
        await sharp(file.buffer)
          .resize(200)
          .toFile(thumbPath);
      } catch (err) {
        console.error('Thumbnail generation failed:', err.message);
      }
    }

    newAttachments.push({
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  const updatedAttachments = [...(expense.attachments || []), ...newAttachments];
  await expenses.update({ _id: expenseId }, { $set: { attachments: updatedAttachments, updatedAt: new Date().toISOString() } });

  return updatedAttachments;
}

export async function removeAttachment(expenseId, filename) {
  const expense = await expenses.findOne({ _id: expenseId });
  if (!expense) throw new Error('Expense not found');

  // Delete files from disk
  const filePath = getFilePath(expenseId, filename);
  const thumbPath = getThumbnailPath(expenseId, filename);
  if (existsSync(filePath)) unlinkSync(filePath);
  if (existsSync(thumbPath)) unlinkSync(thumbPath);

  // Update expense record
  const updatedAttachments = (expense.attachments || []).filter((a) => a.filename !== filename);
  await expenses.update({ _id: expenseId }, { $set: { attachments: updatedAttachments, updatedAt: new Date().toISOString() } });

  return updatedAttachments;
}

export async function removeAllAttachments(expenseId) {
  const dir = getExpenseDir(expenseId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
