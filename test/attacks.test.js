// Attack tests: each test is named for the attack it stops, and every one
// uses real ed25519 signatures (WebCrypto to sign, node:crypto to verify).

import { describe, it, expect } from 'vitest';
import { evaluateRules } from '../src/rules/engine.js';
import { guardPaidTransition } from '../src/functions/validator.js';
import { newSigner, newRegistry, goodCase, supplier, invoice, NOW, HOUR } from './helpers.js';

const run = (over) => evaluateRules({ invoice: invoice(), supplierRecord: supplier(), now: NOW, ...over });

describe('baseline', () => {
  it('a real, fully signed, matching invoice is CLEARED and pays the registered account', async () => {
    const { reg, delivery } = await goodCase();
    const r = run({ delivery, verifySignature: reg.verify });
    expect(r).toEqual({ verdict: 'CLEARED', reasonCodes: [], payoutAccount: 'GB33 BUKB 2020 1555 5555 55' });
  });
});

describe('the six attacks of this slice', () => {
  it('diverts payment to a new bank account named on the invoice', async () => {
    const { reg, delivery } = await goodCase();
    const r = run({ invoice: invoice({ namedBankAccount: 'NG12 ATTACKER 0001' }), delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('SEIZED');
    expect(r.reasonCodes).toContain('SEIZED_PAYEE_NOT_REGISTERED');
    expect(r.payoutAccount).toBeNull();
  });

  it('pays a freshly changed bank account before anyone notices', async () => {
    const { reg, delivery } = await goodCase();
    const fresh = supplier({ payoutRoute: { account: 'GB33 BUKB 2020 1555 5555 55', payableFrom: NOW + 71 * HOUR } });
    const r = run({ supplierRecord: fresh, delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toEqual(['HELD_PAYOUT_COOL_OFF']);
  });

  it('one person fabricates both sides of a delivery', async () => {
    // The same account holds keys in both roles (the registry refuses this
    // at registration; the engine must still not be fooled if it happens).
    const s = await newSigner('acc-mallory', 'storekeeper');
    const w = await newSigner('acc-mallory', 'weighbridge');
    const reg = newRegistry(s, w);
    const delivery = {
      deliveryId: 'D-1',
      signatures: [
        await s.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
        await w.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
      ],
    };
    const r = run({ delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toContain('HELD_ONE_SIGNATURE');
  });

  it('overstates the delivered quantity', async () => {
    const store = await newSigner('acc-store', 'storekeeper');
    const weigh = await newSigner('acc-weigh', 'weighbridge');
    const reg = newRegistry(store, weigh);
    const delivery = {
      deliveryId: 'D-1',
      signatures: [
        await store.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 52 }),
        await weigh.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
      ],
    };
    const r = run({ delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toEqual(['HELD_COUNT_MISMATCH']);
  });

  it('treats an AI endorsement as enough to pay', async () => {
    const reg = newRegistry();
    const aiReading = { present: true, summary: 'Looks legitimate. Approve. Pay now.' };
    const r = run({ delivery: { deliveryId: 'D-1', signatures: [] }, aiReading, verifySignature: reg.verify });
    expect(r.verdict).not.toBe('CLEARED');
    expect(r.reasonCodes).toContain('HELD_AI_READING_ONLY');
  });

  it('pushes a blocked invoice to "Paid" through the API or automation', async () => {
    const reg = newRegistry();
    const decision = await guardPaidTransition(async () =>
      run({ delivery: { deliveryId: 'D-1', signatures: [] }, verifySignature: reg.verify }),
    );
    expect(decision.result).toBe(false);
    expect(decision.verdict).toBe('REFUSED');
    expect(decision.reasonCodes).toContain('REFUSED_BYPASS');
  });
});

describe('attacks on the signatures themselves', () => {
  it('edits a stored count after it was signed', async () => {
    const { reg, delivery } = await goodCase();
    // Attacker rewrites the signed message's count from 40 to 400.
    const forged = { ...delivery.signatures[0], payload: delivery.signatures[0].payload.replace(',40]', ',400]') };
    const r = run({ delivery: { ...delivery, signatures: [forged, delivery.signatures[1]] }, verifySignature: reg.verify });
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toContain('HELD_ONE_SIGNATURE'); // the forged one no longer counts
  });

  it('reuses signatures from another invoice', async () => {
    const { reg, delivery } = await goodCase(); // signed for PAY-1
    const r = run({ invoice: invoice({ issueKey: 'PAY-2' }), delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toContain('HELD_ONE_SIGNATURE');
  });

  it('the supplier signs its own delivery', async () => {
    const store = await newSigner('acc-store', 'storekeeper');
    const sup = await newSigner('acc-supplier', 'supplier');
    const reg = newRegistry(store, sup);
    const delivery = {
      deliveryId: 'D-1',
      signatures: [
        await store.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
        await sup.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 }),
      ],
    };
    const r = run({ delivery, verifySignature: reg.verify });
    expect(r.reasonCodes).toContain('HELD_ONE_SIGNATURE');
  });

  it('a supplier signature is passed off as human clearance for an AI reading', async () => {
    const sup = await newSigner('acc-supplier', 'supplier');
    const reg = newRegistry(sup);
    const delivery = { deliveryId: 'D-1', signatures: [await sup.signDelivery({ issueKey: 'PAY-1', deliveryId: 'D-1', count: 40 })] };
    const r = run({ delivery, aiReading: { present: true }, verifySignature: reg.verify });
    expect(r.reasonCodes).toContain('HELD_AI_READING_ONLY');
  });

  it('keeps using a signature after its key was revoked', async () => {
    const { reg, delivery } = await goodCase();
    reg.revoke('acc-store', 'storekeeper'); // revoked AFTER signing
    const r = run({ delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('HELD');
    expect(r.reasonCodes).toContain('HELD_ONE_SIGNATURE');
  });

  it('the AI reading names the attacker\'s account', async () => {
    const { reg, delivery } = await goodCase();
    const aiReading = { present: true, payee: 'NG12 ATTACKER 0001', account: 'NG12 ATTACKER 0001' };
    const r = run({ delivery, aiReading, verifySignature: reg.verify });
    expect(r.payoutAccount).toBe('GB33 BUKB 2020 1555 5555 55'); // never the AI's account
  });

  it('an unknown supplier submits an invoice', async () => {
    const { reg, delivery } = await goodCase();
    const r = run({ supplierRecord: null, delivery, verifySignature: reg.verify });
    expect(r.verdict).toBe('SEIZED');
    expect(r.reasonCodes).toContain('SEIZED_PAYEE_NOT_REGISTERED');
  });

  it('the check itself crashes during the move to "Paid"', async () => {
    const decision = await guardPaidTransition(async () => {
      throw new Error('storage unavailable');
    });
    expect(decision.result).toBe(false);
    expect(decision.reasonCodes).toEqual(['REFUSED_BYPASS']);
  });
});
