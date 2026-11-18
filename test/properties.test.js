// Property tests (fast-check): each runs on hundreds of generated inputs.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluateRules } from '../src/rules/engine.js';
import { topVerdict, VERDICT_RANK, CODES, verdictOf } from '../src/rules/codes.js';
import { deliveryPayload } from '../src/rules/payload.js';

const RUNS = { numRuns: 300 };
const ROUTE = 'GB33BUKB20201555555555';

// Arbitrary signature (contents never really signed: the verifier decides).
const arbSig = (roles) =>
  fc.record({
    role: fc.constantFrom(...roles),
    signerAccountId: fc.constantFrom('a', 'b', 'c'),
    count: fc.nat(1000),
    issueKey: fc.constantFrom('PAY-1', 'PAY-2'),
    deliveryId: fc.constantFrom('D-1', 'D-2'),
  }).map((s) => ({
    role: s.role,
    signerAccountId: s.signerAccountId,
    keyId: 'k',
    signatureB64: 'x',
    payload: deliveryPayload({ issueKey: s.issueKey, deliveryId: s.deliveryId, role: s.role, signerAccountId: s.signerAccountId, count: s.count }),
  }));

const arbInput = (roles = ['storekeeper', 'weighbridge', 'supplier']) =>
  fc.record({
    named: fc.option(fc.constantFrom(ROUTE, 'NG12ATTACKER', 'gb33 bukb 2020 1555 5555 55'), { nil: null }),
    knownSupplier: fc.boolean(),
    payableOffset: fc.integer({ min: -1000, max: 1000 }),
    sigs: fc.array(arbSig(roles), { maxLength: 4 }),
    verifyAll: fc.boolean(),
    aiPresent: fc.boolean(),
    approved: fc.boolean(),
  }).map((g) => ({
    invoice: { issueKey: 'PAY-1', supplierId: 'SUP-1', namedBankAccount: g.named },
    supplierRecord: g.knownSupplier ? { supplierId: 'SUP-1', payoutRoute: { account: ROUTE, payableFrom: 10_000 + g.payableOffset } } : null,
    delivery: { deliveryId: 'D-1', signatures: g.sigs },
    aiReading: g.aiPresent ? { present: true, payee: 'NG12ATTACKER' } : null,
    approval: g.approved ? { issueKey: 'PAY-1', approverAccountId: 'buyer', approvedAt: 1 } : null,
    now: 10_000,
    verifySignature: () => g.verifyAll,
  }));

describe('properties', () => {
  // Feature: clear-to-pay-rules-engine, Property 7: No AI reading alone clears a payment
  it('no AI reading alone ever clears a payment', () => {
    fc.assert(
      fc.property(arbInput(['supplier', 'storekeeper', 'weighbridge']), fc.boolean(), (input, supplierOnly) => {
        // The only "clearance" is the AI reading: no buyer approval, and any
        // signatures are either unverified or supplier signatures.
        const sigs = input.delivery.signatures.map((s) => (supplierOnly ? { ...s, role: 'supplier' } : s));
        const r = evaluateRules({
          ...input,
          delivery: { ...input.delivery, signatures: sigs },
          aiReading: { present: true },
          approval: null,
          verifySignature: supplierOnly ? input.verifySignature : () => false,
        });
        expect(r.verdict).not.toBe('CLEARED');
        expect(r.reasonCodes).toContain(CODES.HELD_AI_READING_ONLY);
      }),
      RUNS,
    );
  });

  // Property 1: purity and determinism
  it('the engine is pure: same inputs, same output, inputs untouched', () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const before = JSON.stringify({ ...input, verifySignature: undefined });
        const a = evaluateRules(input);
        const b = evaluateRules(input);
        expect(a).toEqual(b);
        expect(JSON.stringify({ ...input, verifySignature: undefined })).toBe(before);
      }),
      RUNS,
    );
  });

  // Property 2: precedence, and every fired code is reported
  it('the verdict is the most severe fired code, and no code is hidden', () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const r = evaluateRules(input);
        const expected = r.reasonCodes.reduce((top, c) => (VERDICT_RANK[verdictOf(c)] > VERDICT_RANK[top] ? verdictOf(c) : top), 'CLEARED');
        expect(r.verdict).toBe(expected);
        expect(r.verdict === 'CLEARED').toBe(r.reasonCodes.length === 0);
      }),
      RUNS,
    );
    fc.assert(
      fc.property(fc.subarray(Object.values(CODES)), (codes) => {
        const ranks = codes.map((c) => VERDICT_RANK[verdictOf(c)]);
        expect(VERDICT_RANK[topVerdict(codes)]).toBe(Math.max(0, ...ranks));
      }),
      RUNS,
    );
  });

  // Property 8: the payout account always comes from the supplier record
  it('the payout account is never taken from the invoice or the AI reading', () => {
    fc.assert(
      fc.property(arbInput(), (input) => {
        const r = evaluateRules(input);
        if (r.verdict === 'CLEARED') expect(r.payoutAccount).toBe(ROUTE);
        else expect(r.payoutAccount).toBeNull();
      }),
      RUNS,
    );
  });

  // Property 4: the cool-off boundary is inclusive, and computed from the clock alone
  it('the 72-hour hold depends only on now versus payableFrom', () => {
    fc.assert(
      fc.property(fc.integer({ min: -5000, max: 5000 }), (offset) => {
        const r = evaluateRules({
          invoice: { issueKey: 'PAY-1', supplierId: 'SUP-1', namedBankAccount: null },
          supplierRecord: { supplierId: 'SUP-1', payoutRoute: { account: ROUTE, payableFrom: 10_000 + offset } },
          delivery: null,
          now: 10_000,
          verifySignature: () => false,
        });
        expect(r.reasonCodes.includes(CODES.HELD_PAYOUT_COOL_OFF)).toBe(10_000 < 10_000 + offset);
      }),
      RUNS,
    );
  });
});
