/**
 * Field-level security (fls) hooks — mask read-hidden fields on every fetch,
 * strip write-blocked fields from every insert/update modifier.
 *
 * Registered as wildcard hooks from db/index.js AFTER attribution, so the
 * updatedBy stamp is already folded into $set before stripping runs
 * (attribution fields are PROTECTED_FIELDS and can never be stripped).
 * Only active when AUTH_ENABLED; system/superuser identities bypass.
 *
 * Effective sets (read-hidden implies write-stripped — write-only fields are
 * deliberately unsupported: full-form saves echo masked values back, so
 * honouring a write-only combination would overwrite real data):
 *   mask   = fls.read
 *   insert = fls.read ∪ fls.create
 *   update = fls.read ∪ fls.update
 *
 * Masking mutates the fetched docs in place — safe because NeDB returns deep
 * copies (model.deepCopy in @seald-io/nedb). Values: strings → REDACTED
 * sentinel, everything else → null. Absent keys stay absent.
 */
import { hooks } from './hooks.js';
import { isAuthEnabled } from './authFlag.js';
import { ForbiddenError } from '../utils/errors.js';
import { REDACTED } from '../../shared/authz/redaction.js';

function grantFls(context) {
  if (!isAuthEnabled()) return null;
  const auth = context.auth;
  if (!auth || auth.system || auth.superuser) return null;
  return auth.grants?.[context.collection]?.fls || null;
}

function effectiveSet(fls, ops) {
  let out = null;
  for (const op of ops) {
    const set = fls[op];
    if (!set?.size) continue;
    if (!out) out = new Set(set);
    else for (const f of set) out.add(f);
  }
  return out;
}

// A modifier key targets an excluded field when it IS the field or a dotted
// path into it ($set['resources.0.dailyRate'] → 'resources').
function isExcludedKey(key, set) {
  return set.has(key) || set.has(key.split('.')[0]);
}

function maskDoc(doc, set) {
  if (!doc || typeof doc !== 'object') return;
  for (const field of set) {
    if (field in doc) {
      doc[field] = typeof doc[field] === 'string' ? REDACTED : null;
    }
  }
}

function mask(context, result) {
  const fls = grantFls(context);
  const set = fls && effectiveSet(fls, ['read']);
  if (!set) return;
  if (Array.isArray(result)) {
    for (const doc of result) maskDoc(doc, set);
  } else {
    maskDoc(result, set);
  }
}

hooks.register({ collection: '*', operation: 'find', phase: 'post', fn: mask });
hooks.register({ collection: '*', operation: 'findOne', phase: 'post', fn: mask });

hooks.register({
  collection: '*',
  operation: 'insert',
  phase: 'pre',
  fn: (context) => {
    const fls = grantFls(context);
    const set = fls && effectiveSet(fls, ['read', 'create']);
    if (!set) return;
    const docs = Array.isArray(context.args[0]) ? context.args[0] : [context.args[0]];
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue;
      for (const key of Object.keys(doc)) {
        if (isExcludedKey(key, set)) delete doc[key];
      }
    }
  },
});

hooks.register({
  collection: '*',
  operation: 'update',
  phase: 'pre',
  fn: (context) => {
    const fls = grantFls(context);
    const set = fls && effectiveSet(fls, ['read', 'update']);
    if (!set) return;
    const modifier = context.args[1];
    if (!modifier || typeof modifier !== 'object') return;
    const hasOperators = Object.keys(modifier).some((k) => k.startsWith('$'));
    if (!hasOperators) {
      // Replacement-style update: stripping keys from a full replacement doc
      // would silently ERASE the hidden fields. No service uses replacements;
      // reject loudly rather than lose data.
      throw new ForbiddenError(
        `Replacement-style updates are not allowed on "${context.collection}" when field-level security applies`,
        'fls_replacement_update'
      );
    }
    for (const [op, value] of Object.entries(modifier)) {
      if (!op.startsWith('$') || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      for (const key of Object.keys(value)) {
        if (isExcludedKey(key, set)) delete value[key];
      }
    }
  },
});
