// The app's service layer: everything the panel and the validator do,
// written against a small `store` (get / set / delete) so it can be tested
// with an in-memory Map and run in Forge with Key-Value Storage.
//
// Security rules applied here:
//  - Who is acting (accountId) ALWAYS comes from the Forge context, never
//    from what the browser sends.
//  - Only public keys are stored. Anything that looks like a private key is
//    refused.
//  - Every verdict is recomputed from current data. Nothing stores a verdict.

import crypto from 'node:crypto';
import { evaluateRules } from './rules/engine.js';
import { parseDeliveryPayload } from './rules/payload.js';
import { makeVerifier, verifyEd25519, assertNoPrivateKey } from './functions/signature.js';

export const COOL_OFF_MS = 72 * 60 * 60 * 1000;
const DELIVERY_ROLES = ['storekeeper', 'weighbridge'];
const ALL_ROLES = [...DELIVERY_ROLES, 'supplier'];

// Storage keys (one place, so they never drift).
export const K = {
  invoice: (issueKey) => `invoice:${issueKey}`,
  supplier: (supplierId) => `supplier:${supplierId}`,
  key: (accountId, role) => `key:${accountId}:${role}`,
  delivery: (issueKey) => `delivery:${issueKey}`,
  ai: (issueKey) => `ai:${issueKey}`,
  approval: (issueKey) => `approval:${issueKey}`,
};

/** Every invoice has exactly one delivery record in this slice. */
export const deliveryIdFor = (issueKey) => `D-${issueKey}`;

function requireText(value, name, max = 120) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) {
    throw new Error(`${name} is required (text, up to ${max} characters)`);
  }
  return value.trim();
}

// ---------------------------------------------------------------------------
// Reading: build the engine's input from storage and evaluate.
// ---------------------------------------------------------------------------

/** Load current data for one issue and run the rules engine. */
export async function evaluateIssue(store, issueKey, now) {
  const stored = (await store.get(K.invoice(issueKey))) ?? {};
  const invoice = {
    issueKey,
    supplierId: stored.supplierId ?? null,
    namedBankAccount: stored.namedBankAccount ?? null,
  };
  const supplierRecord = invoice.supplierId ? (await store.get(K.supplier(invoice.supplierId))) ?? null : null;
  const delivery = (await store.get(K.delivery(issueKey))) ?? { deliveryId: deliveryIdFor(issueKey), signatures: [] };
  const aiReading = (await store.get(K.ai(issueKey))) ?? null;
  const approval = (await store.get(K.approval(issueKey))) ?? null;

  // Load the CURRENT registry entry for each signer, so a revoked key stops
  // counting immediately (including for signatures made before revocation).
  const keys = new Map();
  for (const sig of delivery.signatures ?? []) {
    const id = `${sig.signerAccountId}:${sig.role}`;
    if (!keys.has(id)) keys.set(id, (await store.get(K.key(sig.signerAccountId, sig.role))) ?? null);
  }
  const verifySignature = makeVerifier((accountId, role) => keys.get(`${accountId}:${role}`) ?? null);

  const result = evaluateRules({ invoice, supplierRecord, delivery, aiReading, approval, now, verifySignature });

  // What the panel may show. Counts are NEVER returned: the counts are blind.
  const signedRoles = DELIVERY_ROLES.filter((role) =>
    (delivery.signatures ?? []).some((s) => s.role === role && verifySignature(s)),
  );
  return {
    ...result,
    invoice,
    supplierKnown: !!supplierRecord,
    payableFrom: supplierRecord?.payoutRoute?.payableFrom ?? null,
    signedRoles,
    aiReadingPresent: !!aiReading?.present,
    approvedBy: approval?.approverAccountId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Writing.
// ---------------------------------------------------------------------------

/** Record which supplier an invoice is from, and any bank account it names. */
export async function setInvoice(store, issueKey, { supplierId, namedBankAccount }) {
  const record = {
    supplierId: requireText(supplierId, 'supplierId', 64),
    namedBankAccount: namedBankAccount ? requireText(namedBankAccount, 'namedBankAccount', 64) : null,
  };
  await store.set(K.invoice(issueKey), record);
  return record;
}

/**
 * Register a supplier's payout route (setup in this slice). The 72-hour
 * hold starts from SERVER time: payableFrom = now + 72 h.
 * (Changing an existing route will require the supplier's signature and a
 * buyer approval: rule 3, next slice. Until then a change is refused.)
 */
export async function registerSupplierRoute(store, { supplierId, account }, now) {
  const id = requireText(supplierId, 'supplierId', 64);
  const existing = await store.get(K.supplier(id));
  if (existing) {
    throw new Error('REFUSED_ROUTE_CHANGE_UNSIGNED: changing a registered route needs the supplier\'s signature and buyer approval');
  }
  const record = { supplierId: id, payoutRoute: { account: requireText(account, 'account', 64), payableFrom: now + COOL_OFF_MS } };
  await store.set(K.supplier(id), record);
  return record;
}

/** Check that a base64 SPKI blob really is an ed25519 public key. */
function assertEd25519PublicKey(publicKeySpkiB64) {
  try {
    const k = crypto.createPublicKey({ key: Buffer.from(publicKeySpkiB64, 'base64'), format: 'der', type: 'spki' });
    if (k.asymmetricKeyType !== 'ed25519') throw new Error('not ed25519');
  } catch {
    throw new Error('publicKeySpkiB64 must be an ed25519 public key (base64 SPKI)');
  }
}

/** Register the caller's public key for one role. */
export async function registerKey(store, accountId, { role, publicKeySpkiB64 }, now) {
  assertNoPrivateKey({ role, publicKeySpkiB64 });
  requireText(accountId, 'accountId');
  if (!ALL_ROLES.includes(role)) throw new Error(`role must be one of ${ALL_ROLES.join(', ')}`);
  assertEd25519PublicKey(requireText(publicKeySpkiB64, 'publicKeySpkiB64', 200));

  // One person can never hold both delivery roles.
  if (DELIVERY_ROLES.includes(role)) {
    const other = DELIVERY_ROLES.find((r) => r !== role);
    const otherKey = await store.get(K.key(accountId, other));
    if (otherKey && otherKey.status === 'active') {
      throw new Error(`REFUSED: this account already signs as ${other}; one person cannot hold both delivery roles`);
    }
  }
  const current = await store.get(K.key(accountId, role));
  if (current && current.status === 'active') {
    throw new Error('REFUSED: a key is already registered for this role; revoke it first');
  }
  const entry = { accountId, role, keyId: `${accountId}-${role}-${now}`, publicKeySpkiB64, status: 'active', registeredAt: now, revokedAt: null };
  await store.set(K.key(accountId, role), entry);
  return { keyId: entry.keyId, role };
}

/** Revoke the caller's key for one role. Old signatures stop counting too. */
export async function revokeKey(store, accountId, { role }, now) {
  const entry = await store.get(K.key(accountId, role));
  if (!entry || entry.status !== 'active') throw new Error('No active key for this role');
  await store.set(K.key(accountId, role), { ...entry, status: 'revoked', revokedAt: now });
  return { role, status: 'revoked' };
}

/** Accept a delivery signature from the caller, after checking it. */
export async function submitDeliverySignature(store, issueKey, accountId, sig) {
  assertNoPrivateKey(sig);
  if (sig?.signerAccountId !== accountId) throw new Error('REFUSED: you can only submit your own signature');
  if (!DELIVERY_ROLES.includes(sig.role)) throw new Error('REFUSED: only storekeeper or weighbridge can sign a delivery');
  const key = await store.get(K.key(accountId, sig.role));
  if (!key || key.status !== 'active' || key.keyId !== sig.keyId || !verifyEd25519(sig, key)) {
    throw new Error('REFUSED: signature does not verify against your registered key');
  }
  const msg = parseDeliveryPayload(sig.payload);
  if (!msg || msg.issueKey !== issueKey || msg.deliveryId !== deliveryIdFor(issueKey) || msg.role !== sig.role || msg.signerAccountId !== accountId) {
    throw new Error('REFUSED: signed message does not match this invoice, delivery, role and signer');
  }
  const delivery = (await store.get(K.delivery(issueKey))) ?? { deliveryId: deliveryIdFor(issueKey), signatures: [] };
  const clean = { payload: sig.payload, signatureB64: sig.signatureB64, signerAccountId: accountId, role: sig.role, keyId: sig.keyId };
  // One signature per signer and role: a new one replaces the old one.
  const signatures = delivery.signatures.filter((s) => !(s.signerAccountId === accountId && s.role === sig.role));
  signatures.push(clean);
  await store.set(K.delivery(issueKey), { ...delivery, signatures });
  return { role: sig.role, accepted: true };
}

/** Record the caller's buyer approval for an invoice. */
export async function recordApproval(store, issueKey, accountId, now) {
  const approval = { issueKey, approverAccountId: requireText(accountId, 'accountId'), approvedAt: now };
  await store.set(K.approval(issueKey), approval);
  return approval;
}

/**
 * Store an AI reading. Only a short summary is kept: whatever else arrives
 * (a payee, an account, an "approve" flag) is dropped, because the AI can
 * never name who gets paid or approve anything.
 */
export async function setAiReading(store, issueKey, { summary }) {
  const reading = { present: true, summary: String(summary ?? '').slice(0, 500) };
  await store.set(K.ai(issueKey), reading);
  return reading;
}
