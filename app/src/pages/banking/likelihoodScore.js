const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'was', 'are', 'be',
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function daysBetween(dateA, dateB) {
  const a = typeof dateA === 'string' ? new Date(dateA + 'T00:00:00') : new Date(dateA);
  const b = typeof dateB === 'string' ? new Date(dateB + 'T00:00:00') : new Date(dateB);
  return Math.abs(Math.round((a - b) / 86400000));
}

/**
 * Compute likelihood score between selected transactions and a candidate entity.
 * @param {Array} selectedTransactions - Array of selected transaction objects
 * @param {object} candidate - Expense or invoice object
 * @param {'expense'|'invoice'} candidateType
 * @returns {{ score: number, level: string|null, reasons: string[], bestMatchTxId: string|null }}
 */
export function computeLikelihood(selectedTransactions, candidate, candidateType) {
  if (!selectedTransactions.length) return { score: 0, level: null, reasons: [], bestMatchTxId: null };

  const candidateDate = candidate.date || candidate.invoiceDate;
  const candidateAmount = candidateType === 'invoice' ? candidate.total : candidate.amount;

  let dateScore = 0;
  let amountScore = 0;
  let descScore = 0;
  let bestMatchTxId = null;
  let bestTxScore = -1;
  const reasons = [];

  // Date proximity — best score across all selected transactions
  for (const tx of selectedTransactions) {
    const days = daysBetween(tx.date, candidateDate);
    let s = 0;
    if (days === 0) s = 3;
    else if (days === 1) s = 2;
    else if (days === 2) s = 1;
    else if (days === 3) s = 0.5;
    if (s > dateScore) {
      dateScore = s;
    }
    if (s > bestTxScore) {
      bestTxScore = s;
      bestMatchTxId = tx._id;
    }
  }
  if (dateScore > 0) reasons.push(`Date: ${dateScore >= 3 ? 'same day' : dateScore >= 2 ? '±1 day' : dateScore >= 1 ? '±2 days' : '±3 days'}`);

  // Amount match — best across all selected transactions
  for (const tx of selectedTransactions) {
    const txAmt = Math.abs(tx.amount);
    const candAmt = Math.abs(candidateAmount || 0);
    if (candAmt === 0 && txAmt === 0) continue;
    const diff = Math.abs(txAmt - candAmt);
    const pct = candAmt > 0 ? diff / candAmt : 1;
    let s = 0;
    if (diff < 0.01) s = 3;
    else if (pct <= 0.05) s = 2;
    else if (pct <= 0.10) s = 1;
    if (s > amountScore) amountScore = s;
  }
  if (amountScore > 0) reasons.push(`Amount: ${amountScore >= 3 ? 'exact match' : amountScore >= 2 ? 'within 5%' : 'within 10%'}`);

  // Description overlap — tokenize and compare
  const candidateTokens = new Set(tokenize(candidate.description));
  for (const tx of selectedTransactions) {
    const txTokens = tokenize(tx.description);
    const shared = txTokens.filter((t) => candidateTokens.has(t));
    let s = 0;
    if (shared.length >= 3) s = 2;
    else if (shared.length >= 1) s = 1;
    if (s > descScore) descScore = s;
  }
  if (descScore > 0) reasons.push(`Description: ${descScore >= 2 ? '3+ shared words' : '1-2 shared words'}`);

  const score = dateScore + amountScore + descScore;
  let level = null;
  if (score >= 5) level = 'High';
  else if (score >= 3) level = 'Medium';
  else if (score >= 1) level = 'Low';

  return { score, level, reasons, bestMatchTxId };
}
