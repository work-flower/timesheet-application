/**
 * Transaction JSON Schema
 *
 * Defines the storable fields, types, defaults, and validation rules.
 * System fields (_id, createdAt, updatedAt, isLocked, isLockedReason) are
 * managed by the service layer and intentionally excluded.
 *
 * Properties marked with `x-mappable: true` are available as mapping targets
 * when transforming staged transactions into transactions.
 *
 * `additionalProperties: true` allows extra fields to pass through,
 * preserving NoSQL flexibility.
 */
const transactionSchema = {
  $id: 'transaction',
  type: 'object',
  properties: {
    date: {
      type: 'string',
      format: 'date',
      title: 'Transaction Date',
      'x-mappable': true,
    },
    description: {
      type: 'string',
      title: 'Transaction Description',
      default: '',
      'x-mappable': true,
    },
    amount: {
      type: 'number',
      title: 'Transaction Amount',
      default: 0,
      'x-mappable': true,
    },
    reference: {
      type: ['string', 'null'],
      title: 'Reference',
      default: null,
      'x-mappable': true,
    },
    accountName: {
      type: 'string',
      title: 'Account Name',
      default: '',
      'x-mappable': true,
    },
    accountNumber: {
      type: 'string',
      title: 'Account Number',
      default: '',
      'x-mappable': true,
    },
    importJobId: {
      type: ['string', 'null'],
      title: 'Import Job',
      default: null,
    },
    source: {
      type: ['object', 'null'],
      title: 'Source Data',
      default: null,
    },
    status: {
      type: 'string',
      enum: ['unmatched', 'matched', 'ignored'],
      title: 'Status',
      default: 'unmatched',
    },
    ignoreReason: {
      type: ['string', 'null'],
      title: 'Ignore Reason',
      default: null,
    },
  },
  required: ['date', 'description', 'amount', 'importJobId'],
  additionalProperties: true,
};

export default transactionSchema;

/**
 * Build a record from data using schema definitions.
 * Applies defaults for missing fields and coerces numbers.
 * Passes through additional properties when schema allows it.
 */
export function buildRecord(data, schema = transactionSchema) {
  const record = {};

  for (const [key, prop] of Object.entries(schema.properties)) {
    if (key in data && data[key] != null) {
      record[key] = prop.type === 'number' ? Number(data[key]) : data[key];
    } else if ('default' in prop) {
      record[key] = prop.default;
    }
  }

  // Pass through additional properties
  if (schema.additionalProperties !== false) {
    for (const key of Object.keys(data)) {
      if (!(key in record)) record[key] = data[key];
    }
  }

  return record;
}

/**
 * Validate required fields. Throws on first missing field.
 */
export function validateRequired(data, schema = transactionSchema) {
  for (const field of schema.required || []) {
    if (data[field] == null && data[field] !== 0) {
      const prop = schema.properties[field];
      throw new Error(`${prop?.title || field} is required`);
    }
  }
}
