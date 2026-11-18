// Clear to Pay rules engine: a pure function.
//
// It takes everything it needs as arguments (the invoice, the supplier
// record, the delivery, the AI reading, any buyer approval, the server time
// and a signature checker) and returns a verdict plus every fired reason code.
// It makes no Jira calls, reads no storage and changes none of its inputs,
// so the same inputs always give the same answer and it can be tested alone.

import { CODES, RULE_ORDER, topVerdict } from './codes.js';
import { parseDeliveryPayload } from './payload.js';

const DELIVERY_ROLES = new Set(['storekeeper', 'weighbridge']);

/**
 * Normalise a bank account for comparison: drop spaces and dashes, upper-case.
 * (Lookalike letters and invisible characters are rule 6, a later slice.)
 */
function normaliseAccount(account) {
  return String(account).replace(/[\s-]/g, '').toUpperCase();
}

/**
 * The delivery signatures that really count.
 *
 * A signature counts only when ALL of these hold:
 *  - its role is storekeeper or weighbridge (a supplier signature never counts),
 *  - the injected checker says it verifies (registered, active key; ed25519 ok),
 *  - the signed message parses, and names THIS invoice, THIS delivery, the same
 *    role and the same signer as the signature claims.
 * The count used later comes from inside the signed message.
 */
function verifiedDeliverySignatures(invoice, delivery, verifySignature) {
  const out = [];
  for (const sig of delivery?.signatures ?? []) {
    if (!sig || !DELIVERY_ROLES.has(sig.role)) continue;
    let ok = false;
    try {
      ok = verifySignature(sig) === true;
    } catch {
      ok = false; // a checker that throws never counts as a pass
    }
    if (!ok) continue;
    const msg = parseDeliveryPayload(sig.payload);
    if (!msg) continue;
    if (msg.issueKey !== invoice.issueKey) continue;
    if (msg.deliveryId !== delivery.deliveryId) continue;
    if (msg.role !== sig.role || msg.signerAccountId !== sig.signerAccountId) continue;
    out.push(msg);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The rules. Each returns its reason code when it fires, or null.
// ---------------------------------------------------------------------------

/** Rule 1: pay only the supplier's registered account. */
export function rulePayeeRegistered({ invoice, supplierRecord }) {
  if (!supplierRecord || supplierRecord.supplierId !== invoice.supplierId) {
    return CODES.SEIZED_PAYEE_NOT_REGISTERED; // unknown supplier
  }
  const registered = supplierRecord.payoutRoute?.account;
  if (!registered) return CODES.SEIZED_PAYEE_NOT_REGISTERED; // no route on file
  const named = invoice.namedBankAccount;
  if (named == null || named === '') return null; // invoice names none: we use the registered route
  return normaliseAccount(named) === normaliseAccount(registered)
    ? null
    : CODES.SEIZED_PAYEE_NOT_REGISTERED; // "new bank details" on the invoice
}

/** Rule 2: a new or changed account waits until payableFrom (72 h after approval). */
export function rulePayoutCoolOff({ supplierRecord, now }) {
  const route = supplierRecord?.payoutRoute;
  if (!route?.account) return null; // rule 1 already seizes this case
  const from = route.payableFrom;
  // A route without a valid payableFrom is malformed: hold rather than pay.
  if (!Number.isFinite(from)) return CODES.HELD_PAYOUT_COOL_OFF;
  return now < from ? CODES.HELD_PAYOUT_COOL_OFF : null; // now === payableFrom is payable
}

/** Rule 7: two different people in the two delivery roles must both sign. */
export function ruleOneSignature({ signed }) {
  const store = signed.filter((m) => m.role === 'storekeeper');
  const weigh = signed.filter((m) => m.role === 'weighbridge');
  // Need one storekeeper and one weighbridge signature from DIFFERENT accounts.
  const ok = store.some((s) => weigh.some((w) => w.signerAccountId !== s.signerAccountId));
  return ok ? null : CODES.HELD_ONE_SIGNATURE;
}

/** Rule 8: the two blind counts (read from the signed messages) must agree. */
export function ruleCountMismatch({ signed }) {
  const counts = (role) => new Set(signed.filter((m) => m.role === role).map((m) => m.count));
  const store = counts('storekeeper');
  const weigh = counts('weighbridge');
  if (store.size === 0 || weigh.size === 0) return null; // a missing count is rule 7's job
  // Conflicting counts inside one role are a mismatch too.
  if (store.size > 1 || weigh.size > 1) return CODES.HELD_COUNT_MISMATCH;
  const [s] = store;
  const [w] = weigh;
  return s === w ? null : CODES.HELD_COUNT_MISMATCH;
}

/** Rule 17: an AI reading is advice; it is never enough to pay. */
export function ruleAiReadingOnly({ invoice, aiReading, approval, signed }) {
  if (!aiReading?.present) return null;
  // Human clearance = a verified storekeeper/weighbridge signature, or a
  // buyer approval recorded for this invoice. A supplier signature is NOT
  // clearance, and nothing inside the AI reading can ever count.
  const humanSigned = signed.length > 0;
  const approved =
    !!approval && approval.issueKey === invoice.issueKey && typeof approval.approverAccountId === 'string' && approval.approverAccountId.length > 0;
  return humanSigned || approved ? null : CODES.HELD_AI_READING_ONLY;
}

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------

/**
 * Evaluate every rule for one invoice.
 *
 * @param {object} input
 * @param {object} input.invoice         { issueKey, supplierId, namedBankAccount }
 * @param {object|null} input.supplierRecord { supplierId, payoutRoute: { account, payableFrom } }
 * @param {object|null} input.delivery   { deliveryId, signatures: Signature[] }
 * @param {object|null} input.aiReading  { present, summary? } (advisory only)
 * @param {object|null} input.approval   { issueKey, approverAccountId, approvedAt }
 * @param {number} input.now             server time in ms (never a client clock)
 * @param {(sig) => boolean} input.verifySignature injected ed25519 + key-registry check
 * @returns {{ verdict: string, reasonCodes: string[], payoutAccount: string|null }}
 */
export function evaluateRules(input) {
  const { invoice, supplierRecord = null, delivery = null, aiReading = null, approval = null, now, verifySignature } = input;
  if (!invoice || typeof invoice.issueKey !== 'string') throw new Error('invoice.issueKey is required');
  if (!Number.isFinite(now)) throw new Error('now (server time in ms) is required');
  if (typeof verifySignature !== 'function') throw new Error('verifySignature is required');

  const signed = verifiedDeliverySignatures(invoice, delivery, verifySignature);
  const ctx = { invoice, supplierRecord, delivery, aiReading, approval, now, signed };

  const fired = [
    rulePayeeRegistered(ctx),
    rulePayoutCoolOff(ctx),
    ruleOneSignature(ctx),
    ruleCountMismatch(ctx),
    ruleAiReadingOnly(ctx),
  ].filter(Boolean);

  // Report in rule-table order (already true above; sorting keeps it explicit).
  fired.sort((a, b) => RULE_ORDER.indexOf(a) - RULE_ORDER.indexOf(b));

  const verdict = topVerdict(fired);
  return {
    verdict,
    reasonCodes: fired,
    // The payout account ALWAYS comes from the supplier record, and only when
    // the invoice is cleared. Invoice text and the AI reading are never used.
    payoutAccount: verdict === 'CLEARED' ? supplierRecord.payoutRoute.account : null,
  };
}
