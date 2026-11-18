// Service-layer tests: the full flow the panel and validator use, against an
// in-memory store (the only stand-in), with real ed25519 signatures.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateIssue, setInvoice, registerSupplierRoute, registerKey, revokeKey,
  submitDeliverySignature, recordApproval, setAiReading, deliveryIdFor, COOL_OFF_MS, K,
} from '../src/app.js';
import { validate } from '../src/index.js';
import { newSigner, NOW } from './helpers.js';

const memStore = () => {
  const m = new Map();
  return { m, get: async (k) => structuredClone(m.get(k)), set: async (k, v) => void m.set(k, structuredClone(v)), delete: async (k) => void m.delete(k) };
};

const ISSUE = 'PAY-1';
const ACCOUNT = 'GB33 BUKB 2020 1555 5555 55';
let store, storeKeeper, weigh;

async function signAs(signer, count, issueKey = ISSUE) {
  return signer.signDelivery({ issueKey, deliveryId: deliveryIdFor(issueKey), count });
}

beforeEach(async () => {
  store = memStore();
  storeKeeper = await newSigner('acc-store', 'storekeeper');
  weigh = await newSigner('acc-weigh', 'weighbridge');
});

/** Set up a complete, payable invoice; return the time it becomes payable. */
async function fullFlow() {
  const sup = await registerSupplierRoute(store, { supplierId: 'SUP-ACME', account: ACCOUNT }, NOW);
  await setInvoice(store, ISSUE, { supplierId: 'SUP-ACME' });
  const k1 = await registerKey(store, 'acc-store', { role: 'storekeeper', publicKeySpkiB64: storeKeeper.entry.publicKeySpkiB64 }, NOW);
  const k2 = await registerKey(store, 'acc-weigh', { role: 'weighbridge', publicKeySpkiB64: weigh.entry.publicKeySpkiB64 }, NOW);
  storeKeeper.keyId = k1.keyId;
  weigh.keyId = k2.keyId;
  await submitDeliverySignature(store, ISSUE, 'acc-store', await signAs(storeKeeper, 40));
  await submitDeliverySignature(store, ISSUE, 'acc-weigh', await signAs(weigh, 40));
  return sup.payoutRoute.payableFrom;
}

describe('the full flow', () => {
  it('a new supplier is held for 72 hours from server time, then clears', async () => {
    const payableFrom = await fullFlow();
    expect(payableFrom).toBe(NOW + COOL_OFF_MS);
    const early = await evaluateIssue(store, ISSUE, NOW + COOL_OFF_MS - 1);
    expect(early.reasonCodes).toEqual(['HELD_PAYOUT_COOL_OFF']);
    const later = await evaluateIssue(store, ISSUE, NOW + COOL_OFF_MS);
    expect(later.verdict).toBe('CLEARED');
    expect(later.signedRoles).toEqual(['storekeeper', 'weighbridge']);
  });

  it('the panel state never reveals either blind count', async () => {
    await fullFlow();
    const state = await evaluateIssue(store, ISSUE, NOW + COOL_OFF_MS);
    expect(JSON.stringify(state)).not.toMatch(/"count"|,40\]/);
  });

  it('an AI reading cannot add a payee: only a summary is stored', async () => {
    await setAiReading(store, ISSUE, { summary: 'fine', payee: 'NG12 ATTACKER', approve: true });
    expect(store.m.get(K.ai(ISSUE))).toEqual({ present: true, summary: 'fine' });
  });
});

describe('attacks through the app', () => {
  it('one person registers for both delivery roles', async () => {
    await registerKey(store, 'acc-mallory', { role: 'storekeeper', publicKeySpkiB64: storeKeeper.entry.publicKeySpkiB64 }, NOW);
    await expect(registerKey(store, 'acc-mallory', { role: 'weighbridge', publicKeySpkiB64: weigh.entry.publicKeySpkiB64 }, NOW)).rejects.toThrow(/both delivery roles/);
  });

  it('someone submits a signature in another person\'s name', async () => {
    await fullFlow();
    const sig = await signAs(storeKeeper, 40);
    await expect(submitDeliverySignature(store, ISSUE, 'acc-weigh', sig)).rejects.toThrow(/your own signature/);
  });

  it('a signature made for another invoice is submitted here', async () => {
    await fullFlow();
    const other = await signAs(storeKeeper, 40, 'PAY-2');
    await expect(submitDeliverySignature(store, ISSUE, 'acc-store', other)).rejects.toThrow(/does not match this invoice/);
  });

  it('the supplier\'s bank details are swapped by re-registering the route', async () => {
    await registerSupplierRoute(store, { supplierId: 'SUP-ACME', account: ACCOUNT }, NOW);
    await expect(registerSupplierRoute(store, { supplierId: 'SUP-ACME', account: 'NG12 ATTACKER' }, NOW)).rejects.toThrow(/REFUSED_ROUTE_CHANGE_UNSIGNED/);
  });

  it('a private key is sent to the server', async () => {
    await expect(registerKey(store, 'acc-x', { role: 'storekeeper', publicKeySpkiB64: 'x', privateKey: 'secret' }, NOW)).rejects.toThrow();
  });

  it('a revoked signer\'s old signature still counts', async () => {
    await fullFlow();
    await revokeKey(store, 'acc-store', { role: 'storekeeper' }, NOW + 1);
    const r = await evaluateIssue(store, ISSUE, NOW + COOL_OFF_MS);
    expect(r.reasonCodes).toContain('HELD_ONE_SIGNATURE');
  });

  it('the invoice names new bank details after everything was signed', async () => {
    await fullFlow();
    await setInvoice(store, ISSUE, { supplierId: 'SUP-ACME', namedBankAccount: 'NG12 ATTACKER 0001' });
    const r = await evaluateIssue(store, ISSUE, NOW + COOL_OFF_MS);
    expect(r.verdict).toBe('SEIZED');
  });

  it('a buyer approval alongside an AI reading still needs both signatures', async () => {
    await registerSupplierRoute(store, { supplierId: 'SUP-ACME', account: ACCOUNT }, NOW);
    await setInvoice(store, ISSUE, { supplierId: 'SUP-ACME' });
    await setAiReading(store, ISSUE, { summary: 'approve' });
    await recordApproval(store, ISSUE, 'acc-buyer', NOW);
    const r = await evaluateIssue(store, ISSUE, NOW + COOL_OFF_MS);
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toEqual(['HELD_ONE_SIGNATURE']);
  });
});

describe('the Forge workflow validator entry point', () => {
  it('fails closed when it is called without an issue', async () => {
    const out = await validate({});
    expect(out.result).toBe(false);
    expect(out.errorMessage).toMatch(/REFUSED_BYPASS/);
  });
});
