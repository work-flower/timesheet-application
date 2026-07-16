/**
 * Generates synthetic receipt fixtures for exercising POST /api/expenses/parse-receipts.
 *
 * Produces, in the directory given as argv[2] (default ./tmp-receipts):
 *   receipt.jpg   — a legible receipt image (the case that was broken before the
 *                   document-vs-image content-block fix)
 *   receipt.png   — same content, PNG (exercises another whitelisted media type)
 *   receipt.heic  — a JPEG deliberately mislabelled .heic, to check the
 *                   unsupported-type path returns a clean per-file error
 *
 * Usage:  node scripts/make-test-receipt.mjs [outDir]
 * Then:   curl -s -F files=@tmp-receipts/receipt.jpg http://localhost:18001/api/expenses/parse-receipts | jq
 *
 * Uses sharp, already a production dependency. Writes nothing outside outDir.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const outDir = resolve(process.argv[2] || 'tmp-receipts');
mkdirSync(outDir, { recursive: true });

// Values chosen so the parse result is unambiguous to eyeball:
// gross 128.40 = net 107.00 + VAT 21.40 (20%).
const RECEIPT = {
  vendor: 'THE KINGS ARMS',
  addr: '42 High Street, Manchester M1 2AB',
  vatNo: 'GB 123 4567 89',
  invoice: 'INV-99127',
  date: '14/07/2026',
  lines: [
    ['Dinner, 2 covers', '86.00'],
    ['House red, bottle', '21.00'],
  ],
  net: '107.00',
  vat: '21.40',
  total: '128.40',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let y = 90;
const row = (label, value, opts = {}) => {
  const size = opts.size || 26;
  const weight = opts.bold ? 'bold' : 'normal';
  y += opts.gap ?? 40;
  return (
    `<text x="60" y="${y}" font-family="monospace" font-size="${size}" font-weight="${weight}" fill="#111">${esc(label)}</text>` +
    (value != null
      ? `<text x="700" y="${y}" font-family="monospace" font-size="${size}" font-weight="${weight}" fill="#111" text-anchor="end">${esc(value)}</text>`
      : '')
  );
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="900">
  <rect width="760" height="900" fill="#ffffff"/>
  <text x="380" y="60" font-family="monospace" font-size="34" font-weight="bold" fill="#111" text-anchor="middle">${esc(RECEIPT.vendor)}</text>
  ${row(RECEIPT.addr, null, { size: 20, gap: 30 })}
  ${row(`VAT Reg: ${RECEIPT.vatNo}`, null, { size: 20, gap: 30 })}
  ${row(`Invoice: ${RECEIPT.invoice}`, null, { size: 22, gap: 40 })}
  ${row(`Date: ${RECEIPT.date}`, null, { size: 22, gap: 30 })}
  ${row('-'.repeat(44), null, { size: 22, gap: 40 })}
  ${RECEIPT.lines.map(([d, a]) => row(d, a, { size: 24 })).join('')}
  ${row('-'.repeat(44), null, { size: 22 })}
  ${row('Subtotal (net)', RECEIPT.net, { size: 24 })}
  ${row('VAT @ 20%', RECEIPT.vat, { size: 24 })}
  ${row('TOTAL', RECEIPT.total, { size: 30, bold: true })}
  ${row('Paid by card ****4021', null, { size: 20, gap: 50 })}
  ${row('Thank you for your visit', null, { size: 20, gap: 30 })}
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();

writeFileSync(join(outDir, 'receipt.png'), png);
writeFileSync(join(outDir, 'receipt.jpg'), jpg);
// A real JPEG with a .heic name — multer types it from the part header, so this
// reaches the service as a supported type. To exercise the unsupported path the
// client must actually send image/heic; see the curl note printed below.
writeFileSync(join(outDir, 'receipt.heic'), jpg);

console.log(`Wrote fixtures to ${outDir}`);
console.log(`  receipt.jpg   ${(jpg.length / 1024).toFixed(0)} KB`);
console.log(`  receipt.png   ${(png.length / 1024).toFixed(0)} KB`);
console.log(`\nExpected parse: date 2026-07-14, amount 128.40, vatAmount 21.40, externalReference INV-99127`);
console.log(`\nTry:\n  curl -s -F files=@${join(outDir, 'receipt.jpg')} http://localhost:18001/api/expenses/parse-receipts | jq`);
console.log(`Unsupported-type path (force the media type):\n  curl -s -F 'files=@${join(outDir, 'receipt.heic')};type=image/heic' http://localhost:18001/api/expenses/parse-receipts | jq`);
