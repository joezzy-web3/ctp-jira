// The exact message a delivery signer signs.
//
// Why this matters: the blind count is read from INSIDE the signed message,
// never from a separate field. If anyone edits a stored count after signing,
// the signature no longer matches and the count stops counting. The message
// also names the invoice, the delivery, the role and the signer, so a
// signature made for one invoice or role cannot be reused for another.

const PREFIX = 'ctp-delivery-v1';

/**
 * Build the canonical string a storekeeper or weighbridge operator signs.
 * Field order is fixed so the same inputs always give the same bytes.
 */
export function deliveryPayload({ issueKey, deliveryId, role, signerAccountId, count }) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('count must be a non-negative whole number');
  }
  return JSON.stringify([PREFIX, issueKey, deliveryId, role, signerAccountId, count]);
}

/**
 * Read a signed delivery message back. Returns null for anything that is not
 * exactly a well-formed v1 delivery message (never guesses, never repairs).
 */
export function parseDeliveryPayload(text) {
  let parts;
  try {
    parts = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parts) || parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [, issueKey, deliveryId, role, signerAccountId, count] = parts;
  if (![issueKey, deliveryId, role, signerAccountId].every((s) => typeof s === 'string' && s.length > 0)) return null;
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return { issueKey, deliveryId, role, signerAccountId, count };
}
