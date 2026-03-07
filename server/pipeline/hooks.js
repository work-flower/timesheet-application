/**
 * Central hook registry for pipeline pre/post hooks.
 */
class HookRegistry {
  constructor() {
    this._hooks = [];
  }

  /**
   * Register a hook.
   * @param {object} opts
   * @param {string} opts.collection - Collection name or '*' for all
   * @param {string} opts.operation  - Operation name or '*' for all
   * @param {'pre'|'post'} opts.phase
   * @param {function} [opts.filter] - Optional (context) => boolean guard
   * @param {function} opts.fn       - Hook function (context, data?) => void
   */
  register({ collection, operation, phase, filter, fn }) {
    this._hooks.push({ collection, operation, phase, filter, fn });
  }

  /**
   * Run all matching hooks for a given phase/collection/operation.
   */
  async run(phase, collection, operation, context, data) {
    for (const hook of this._hooks) {
      if (hook.phase !== phase) continue;
      if (hook.collection !== '*' && hook.collection !== collection) continue;
      if (hook.operation !== '*' && hook.operation !== operation) continue;
      if (hook.filter && !hook.filter(context)) continue;
      await hook.fn(context, data);
    }
  }
}

export const hooks = new HookRegistry();
