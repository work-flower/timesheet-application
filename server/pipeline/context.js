import als from '../logging/asyncContext.js';

/**
 * Build a pipeline context from the current ALS store + operation metadata.
 */
export function buildContext(collection, operation, args) {
  const store = als.getStore() || {};
  return {
    requestId: store.requestId || null,
    traceId: store.traceId || null,
    source: store.source || null,
    method: store.method || null,
    path: store.path || null,
    collection,
    operation,
    args,
  };
}
