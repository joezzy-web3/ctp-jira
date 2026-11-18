// The exact message a delivery signer signs. MUST stay identical to
// src/rules/payload.js on the server (a test checks both give the same bytes).

const PREFIX = 'ctp-delivery-v1';

export function deliveryPayload({ issueKey, deliveryId, role, signerAccountId, count }) {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('count must be a non-negative whole number');
  }
  return JSON.stringify([PREFIX, issueKey, deliveryId, role, signerAccountId, count]);
}
