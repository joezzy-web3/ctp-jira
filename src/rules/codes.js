// Reason codes and verdicts for Clear to Pay.
//
// Every rule that fires returns exactly one of these codes. The prefix of a
// code tells you its verdict: SEIZED_*, REFUSED_*, HELD_*. The engine never
// invents a code that is not in this list.

export const CODES = Object.freeze({
  SEIZED_PAYEE_NOT_REGISTERED: 'SEIZED_PAYEE_NOT_REGISTERED', // rule 1
  HELD_PAYOUT_COOL_OFF: 'HELD_PAYOUT_COOL_OFF',               // rule 2
  HELD_ONE_SIGNATURE: 'HELD_ONE_SIGNATURE',                   // rule 7
  HELD_COUNT_MISMATCH: 'HELD_COUNT_MISMATCH',                 // rule 8
  HELD_AI_READING_ONLY: 'HELD_AI_READING_ONLY',               // rule 17
  REFUSED_BYPASS: 'REFUSED_BYPASS',                           // rule 21 (workflow validator)
});

// Rule-table order. The engine reports fired codes in this order so the
// output is identical for identical inputs.
export const RULE_ORDER = Object.freeze([
  CODES.SEIZED_PAYEE_NOT_REGISTERED,
  CODES.HELD_PAYOUT_COOL_OFF,
  CODES.HELD_ONE_SIGNATURE,
  CODES.HELD_COUNT_MISMATCH,
  CODES.HELD_AI_READING_ONLY,
  CODES.REFUSED_BYPASS,
]);

// Verdict precedence: a more severe verdict always wins.
export const VERDICT_RANK = Object.freeze({ CLEARED: 0, HELD: 1, REFUSED: 2, SEIZED: 3 });

/** The verdict a single reason code stands for, read from its prefix. */
export function verdictOf(code) {
  if (code.startsWith('SEIZED_')) return 'SEIZED';
  if (code.startsWith('REFUSED_')) return 'REFUSED';
  if (code.startsWith('HELD_')) return 'HELD';
  throw new Error(`Unknown reason code: ${code}`);
}

/** The most severe verdict among fired codes; CLEARED when none fired. */
export function topVerdict(firedCodes) {
  let top = 'CLEARED';
  for (const code of firedCodes) {
    const v = verdictOf(code);
    if (VERDICT_RANK[v] > VERDICT_RANK[top]) top = v;
  }
  return top;
}
