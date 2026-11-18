// The ed25519 round trip: sign with WebCrypto (the browser's API), verify
// with node:crypto (what the Forge function uses). No mocks.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { verifyEd25519, assertNoPrivateKey } from '../src/functions/signature.js';
import { newSigner } from './helpers.js';

describe('ed25519 between the browser and Forge', () => {
  it('a browser signature verifies in Forge; any tampering fails', async () => {
    const signer = await newSigner('acc-store', 'storekeeper');
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 200 }), async (payload) => {
        const sig = await signer.sign(payload);
        expect(verifyEd25519(sig, signer.entry)).toBe(true);
        expect(verifyEd25519({ ...sig, payload: payload + ' ' }, signer.entry)).toBe(false);
        const bytes = Buffer.from(sig.signatureB64, 'base64');
        bytes[0] ^= 1;
        expect(verifyEd25519({ ...sig, signatureB64: bytes.toString('base64') }, signer.entry)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('a signature does not verify under someone else\'s key', async () => {
    const a = await newSigner('acc-a', 'storekeeper');
    const b = await newSigner('acc-b', 'weighbridge');
    const sig = await a.sign('hello');
    expect(verifyEd25519(sig, b.entry)).toBe(false);
  });

  it('a revoked or missing key never verifies', async () => {
    const a = await newSigner('acc-a', 'storekeeper');
    const sig = await a.sign('hello');
    expect(verifyEd25519(sig, { ...a.entry, status: 'revoked' })).toBe(false);
    expect(verifyEd25519(sig, null)).toBe(false);
  });

  it('the browser key is non-extractable: the private key cannot be exported', async () => {
    const a = await newSigner('acc-a', 'storekeeper');
    await expect(globalThis.crypto.subtle.exportKey('pkcs8', a.privateKey)).rejects.toThrow();
  });

  it('the server refuses any request that carries a private key', () => {
    expect(() => assertNoPrivateKey({ privateKey: 'abc' })).toThrow(/never leave/);
    expect(() => assertNoPrivateKey({ pem: '-----BEGIN PRIVATE KEY-----' })).toThrow();
    expect(() => assertNoPrivateKey({ publicKeySpkiB64: 'abc' })).not.toThrow();
  });
});
