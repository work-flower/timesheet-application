/**
 * Context-preserving upload middleware — the ONLY sanctioned way to accept
 * multipart bodies. Routes must import createUpload from here, never multer
 * directly.
 *
 * Why: the per-request ALS store (als.run in server/index.js) does not survive
 * multer's body parsing. Busboy's completion fires from the request socket's
 * I/O events, whose async context predates als.run — so the route handler runs
 * with als.getStore() === undefined. Under AUTH_ENABLED every wrapped-collection
 * call then sees auth=null and 403s 'Not authenticated'; with auth off, log
 * entries silently lose requestId/traceId/user enrichment.
 *
 * createUpload captures the store before parsing and re-enters it (als.run)
 * around the continuation, errors included — the handler and the central error
 * handler both see the caller's identity and trace context.
 */
import multer from 'multer';
import als from '../logging/asyncContext.js';

const STORE = Symbol('alsStore');

export function createUpload(opts) {
  const m = multer(opts);
  const wrap = (mw) => (req, res, next) => {
    const store = als.getStore();
    // Stashed for storage callbacks (contextualDiskStorage), which run
    // mid-parse inside busboy's context — outside the store's scope.
    req[STORE] = store;
    mw(req, res, (err) => (store ? als.run(store, () => next(err)) : next(err)));
  };
  return {
    single: (...args) => wrap(m.single(...args)),
    array: (...args) => wrap(m.array(...args)),
    fields: (...args) => wrap(m.fields(...args)),
    any: (...args) => wrap(m.any(...args)),
  };
}

/**
 * diskStorage whose destination/filename callbacks run inside the request's
 * ALS store — required when a callback touches a pipeline-wrapped collection
 * (e.g. the notebooks media resolver), which also makes that lookup
 * caller-scoped. Use with createUpload({ storage: contextualDiskStorage(...) }).
 */
export function contextualDiskStorage({ destination, filename }) {
  const bind = (fn) =>
    fn &&
    ((req, file, cb) =>
      req[STORE] ? als.run(req[STORE], () => fn(req, file, cb)) : fn(req, file, cb));
  return multer.diskStorage({ destination: bind(destination), filename: bind(filename) });
}
