import { buildContext } from './context.js';
import { CursorProxy } from './cursorProxy.js';
import { hooks } from './hooks.js';
import { checkAccess } from './authorisation.js';

// Methods that return cursors (thenable, chainable)
const CURSOR_METHODS = new Set(['find', 'findOne', 'count']);

// Methods that return promises directly
const ASYNC_METHODS = new Set(['insert', 'update', 'remove']);

/**
 * Wrap a NeDB datastore with a Proxy that intercepts DB operations
 * for authorization checks and pre/post hooks.
 *
 * @param {string} name       - Collection name (e.g. 'timesheets')
 * @param {object} datastore  - NeDB Datastore instance
 * @returns {Proxy}
 */
export function wrapCollection(name, datastore) {
  return new Proxy(datastore, {
    get(target, prop, receiver) {
      if (CURSOR_METHODS.has(prop)) {
        return (...args) => {
          const context = buildContext(name, prop, args);
          checkAccess(context);
          hooks.run('pre', name, prop, context);
          const realCursor = target[prop](...args);
          return new CursorProxy(realCursor, name, prop, context);
        };
      }

      if (ASYNC_METHODS.has(prop)) {
        return async (...args) => {
          const context = buildContext(name, prop, args);
          checkAccess(context);
          await hooks.run('pre', name, prop, context);
          const result = await target[prop](...args);
          await hooks.run('post', name, prop, context, result);
          return result;
        };
      }

      // Everything else (EventEmitter methods, load, etc.) passes through
      return Reflect.get(target, prop, receiver);
    },
  });
}

export { hooks } from './hooks.js';
