// Server-side ed25519 signature checking (runs inside a Forge function).
//
// The browser creates the key pair with WebCrypto and keeps the private key
// (non-extractable). Only the public key reaches us, as base64 SPKI DER.
// Here we check signatures with Node's built-in crypto module: no mocks, no
// third-party crypto.

import crypto from 'node:crypto';

/**
 * Check one signature against one registered key.
 * Returns false (never throws) for a missing, revoked or malformed key or
 * signature, so a bad input can only ever fail closed.
 *
 * @param {{ payload: string, signatureB64: string }} sig
 * @param {{ publicKeySpkiB64: string, status: 'active'|'revoked' } | null} key
 */
export function verifyEd25519(sig, key) {
  if (!key || key.status !== 'active') return false;
  if (typeof sig?.payload !== 'string' || typeof sig?.signatureB64 !== 'string') return false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(key.publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (publicKey.asymmetricKeyType !== 'ed25519') return false;
    const signature = Buffer.from(sig.signatureB64, 'base64');
    if (signature.length !== 64) return false;
    // Ed25519 takes no separate digest, hence `null`.
    return crypto.verify(null, Buffer.from(sig.payload, 'utf8'), publicKey, signature);
  } catch {
    return false;
  }
}

/**
 * Build the `verifySignature` checker the rules engine expects.
 *
 * @param {(accountId: string, role: string) => object|null} lookupKey
 *   Returns the CURRENT registry entry for that signer and role. Because the
 *   engine always asks the current registry, a revoked key stops counting at
 *   once, including for signatures made before it was revoked.
 */
export function makeVerifier(lookupKey) {
  return (sig) => {
    const key = lookupKey(sig?.signerAccountId, sig?.role);
    if (!key || key.keyId !== sig?.keyId) return false;
    return verifyEd25519(sig, key);
  };
}

/** Refuse anything that looks like a private key arriving at the server. */
export function assertNoPrivateKey(body) {
  const text = JSON.stringify(body ?? {});
  if (/"(privateKey|private_key|d)"\s*:/.test(text) || /PRIVATE KEY/.test(text)) {
    throw new Error('Refused: private keys must never leave the signer\'s browser');
  }
}
