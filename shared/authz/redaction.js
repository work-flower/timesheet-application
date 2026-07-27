/**
 * Field-level security sentinel — the value read-hidden string fields carry in
 * API responses, and the text the frontend's redacted control displays.
 * Single definition shared by the server mask hook (server/pipeline/fieldSecurity.js)
 * and the app UI (FormField's RedactedControl) so the two can never drift.
 * Non-string values mask to null, not to this sentinel (typed fields cannot
 * carry a string, and formatters would render it as NaN).
 */
export const REDACTED = '***redacted***';
