import { hooks } from './hooks.js';

/**
 * Wraps a NeDB Cursor to intercept exec/then/catch for post-hook execution.
 * Preserves the full chaining API (sort/skip/limit/project).
 */
export class CursorProxy {
  constructor(realCursor, collection, operation, context) {
    this._cursor = realCursor;
    this._collection = collection;
    this._operation = operation;
    this._context = context;
  }

  sort(order) {
    this._cursor.sort(order);
    return this;
  }

  skip(n) {
    this._cursor.skip(n);
    return this;
  }

  limit(n) {
    this._cursor.limit(n);
    return this;
  }

  project(p) {
    this._cursor.project(p);
    return this;
  }

  async exec() {
    const result = await this._cursor.exec();
    await hooks.run('post', this._collection, this._operation, this._context, result);
    return result;
  }

  then(fulfilled, rejected) {
    return this.exec().then(fulfilled, rejected);
  }

  catch(rejected) {
    return this.exec().catch(rejected);
  }
}
