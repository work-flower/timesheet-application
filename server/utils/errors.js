/**
 * Typed errors + route response helper.
 *
 * ForbiddenError is thrown by the authorisation pipeline (checkAccess,
 * enforceWriteScope, requireAction). Routes surface it as 403 with a
 * machine-readable `code` by using respondError in their catch blocks.
 */
export class ForbiddenError extends Error {
  constructor(message, code = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.code = code;
  }
}

/**
 * Map an error to an HTTP response. Uses err.statusCode when present (typed
 * errors), otherwise the route's conventional fallback (400 for writes,
 * 500 for reads).
 */
export function respondError(res, err, fallbackStatus = 500) {
  const status = err.statusCode || fallbackStatus;
  const body = { error: err.message };
  if (err.code) body.code = err.code;
  res.status(status).json(body);
}
