/**
 * VAT Golden Rule — shared between frontend and backend.
 *
 * Given amount (gross), vatAmount, and vatPercent:
 * - If vatPercent is non-zero and vatAmount is 0 → derive vatAmount from vatPercent
 * - If vatAmount is non-zero and vatPercent is 0 → derive vatPercent from vatAmount
 * - If both are non-zero or both are zero → keep as-is
 * - netAmount is always computed as amount - vatAmount
 *
 * Handles negative amounts (credit notes/refunds) by using absolute values internally.
 */
export function computeVat(amount, vatAmount, vatPercent) {
  const absAmount = Math.abs(amount);

  if (vatPercent !== 0 && vatAmount === 0 && absAmount > 0) {
    vatAmount = Math.sign(amount) * Math.round(absAmount * vatPercent / (100 + vatPercent) * 100) / 100;
  } else if (vatAmount !== 0 && vatPercent === 0 && absAmount > 0) {
    const absVat = Math.abs(vatAmount);
    const absNet = absAmount - absVat;
    vatPercent = absNet > 0 ? Math.round((absVat / absNet) * 100 * 100) / 100 : 0;
  }

  const netAmount = Math.round((amount - vatAmount) * 100) / 100;

  return { vatAmount, vatPercent, netAmount };
}

/**
 * Live VAT derivation for form fields — used when the user changes one field
 * and the other should update immediately.
 *
 * Unlike the golden rule (which only derives when one is 0), this always
 * recalculates the counterpart field from the changed field.
 */
export function deriveVatFromPercent(amount, vatPercent) {
  const absAmount = Math.abs(amount);
  const vatAmount = absAmount > 0
    ? Math.sign(amount) * Math.round(absAmount * vatPercent / (100 + vatPercent) * 100) / 100
    : 0;
  const netAmount = Math.round((amount - vatAmount) * 100) / 100;
  return { vatAmount, vatPercent, netAmount };
}

export function deriveVatFromAmount(amount, vatAmount) {
  const absAmount = Math.abs(amount);
  const absVat = Math.abs(vatAmount);
  const absNet = absAmount - absVat;
  const vatPercent = absNet > 0 ? Math.round((absVat / absNet) * 100 * 100) / 100 : 0;
  const netAmount = Math.round((amount - vatAmount) * 100) / 100;
  return { vatAmount, vatPercent, netAmount };
}
