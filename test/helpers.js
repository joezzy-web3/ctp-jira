// Test helpers: REAL ed25519 keys made with WebCrypto (as in the browser) and
// a real in-memory key registry checked with node:crypto (as in Forge).
// The only stand-in is the registry's storage (a Map instead of Forge KVS).

import { deliveryPayload } from '../src/rules/payload.js';
import { makeVerifier } from '../src/functions/signature.js';

const { subtle } = globalThis.crypto;
const b64 = (buf) => Buffer.from(buf).toString('base64');

/** Create a signer exactly as the browser will: non-extractable private key. */
export async function newSigner(accountId, role) {
  const pair = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const spki = await subtle.exportKey('spki', pair.publicKey);
  const keyId = `${accountId}-${role}-1`;
  return {
    accountId,
    role,
    keyId,
    privateKey: pair.privateKey,
    entry: { accountId, role, keyId, publicKeySpkiB64: b64(spki), status: 'active' },
    async sign(payload) {
      const sig = await subtle.sign({ name: 'Ed25519' }, pair.privateKey, Buffer.from(payload, 'utf8'));
      return { payload, signatureB64: b64(sig), signerAccountId: accountId, role, keyId };
    },
    async signDelivery({ issueKey, deliveryId, count }) {
      return this.sign(deliveryPayload({ issueKey, deliveryId, role, signerAccountId: accountId, count }));
    },
  };
}

/** A key registry backed by a Map, used through the real verifier. */
export function newRegistry(...signers) {
  const map = new Map();
  for (const s of signers) map.set(`${s.accountId}:${s.role}`, { ...s.entry });
  return {
    map,
    revoke(accountId, role) {
      const e = map.get(`${accountId}:${role}`);
      if (e) e.status = 'revoked';
    },
    verify: makeVerifier((accountId, role) => map.get(`${accountId}:${role}`) ?? null),
  };
}

export const HOUR = 60 * 60 * 1000;
export const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

export const supplier = (over = {}) => ({
  supplierId: 'SUP-ACME',
  payoutRoute: { account: 'GB33 BUKB 2020 1555 5555 55', payableFrom: NOW - 100 * HOUR },
  ...over,
});

export const invoice = (over = {}) => ({ issueKey: 'PAY-1', supplierId: 'SUP-ACME', namedBankAccount: null, ...over });

/** A fully good case: two different people sign matching counts. */
export async function goodCase() {
  const store = await newSigner('acc-store', 'storekeeper');
  const weigh = await newSigner('acc-weigh', 'weighbridge');
  const reg = newRegistry(store, weigh);
  const delivery = {
    deliveryId: 'D-1',
    signatures: [
      await store.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
      await weigh.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
    ],
  };
  return { store, weigh, reg, delivery };
}
