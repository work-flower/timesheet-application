import { PDFDocument } from 'pdf-lib';

/**
 * Combine multiple PDF buffers into a single PDF.
 * Each input PDF is appended as-is (all pages preserved).
 * @param {Buffer[]} pdfBuffers - array of PDF file buffers
 * @returns {Promise<Buffer>} - combined PDF buffer
 */
export async function combinePdfs(pdfBuffers) {
  const merged = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    const doc = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
}
