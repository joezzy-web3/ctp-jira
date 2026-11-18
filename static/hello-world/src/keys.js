// Browser-side signing keys.
//
// The key pair is made with WebCrypto as NON-EXTRACTABLE: the private key can
// sign, but it can never be read out, exported or sent anywhere. It is kept
// in this browser's IndexedDB as an opaque key handle. Only the public key
// (base64 SPKI) is ever sent to the server.

const DB = 'ctp-keys';
const STORE = 'keys';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const slot = (accountId, role) => `${accountId}:${role}`;
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** Make a new key pair and keep the private half in this browser. */
export async function createKey(accountId, role) {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  await idb('readwrite', (s) => s.put({ privateKey: pair.privateKey, keyId: null }, slot(accountId, role)));
  return { publicKeySpkiB64: toB64(spki) };
}

/** Remember the key ID the server assigned to this key. */
export async function setKeyId(accountId, role, keyId) {
  const rec = await idb('readonly', (s) => s.get(slot(accountId, role)));
  if (!rec) throw new Error('No key in this browser');
  await idb('readwrite', (s) => s.put({ ...rec, keyId }, slot(accountId, role)));
}

export async function hasKey(accountId, role) {
  const rec = await idb('readonly', (s) => s.get(slot(accountId, role)));
  return !!rec?.keyId;
}

/** Sign a message with this browser's key; returns what the server needs. */
export async function sign(accountId, role, payload) {
  const rec = await idb('readonly', (s) => s.get(slot(accountId, role)));
  if (!rec?.keyId) throw new Error(`No ${role} key in this browser. Create one first.`);
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, rec.privateKey, new TextEncoder().encode(payload));
  return { payload, signatureB64: toB64(sig), signerAccountId: accountId, role, keyId: rec.keyId };
}

export function webCryptoEd25519Supported() {
  return !!(globalThis.crypto && crypto.subtle);
}
