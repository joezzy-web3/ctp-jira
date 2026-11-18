// The guard on the move to "Paid" (Forge jira:workflowValidator).
//
// Jira runs a workflow validator for EVERY transition through that step,
// whether it comes from the UI, the REST API, an automation rule or a bulk
// edit. The validator recomputes the verdict from current data at that
// moment; it never trusts a stored or cached verdict.

import { CODES, topVerdict } from '../rules/codes.js';

/**
 * Decide one transition into "Paid".
 *
 * @param {() => Promise<{verdict: string, reasonCodes: string[]}>} recompute
 *   Loads current data and runs the rules engine. Called on every transition.
 * @returns {Promise<{ result: boolean, errorMessage?: string, verdict: string, reasonCodes: string[] }>}
 */
export async function guardPaidTransition(recompute) {
  let outcome;
  try {
    outcome = await recompute();
  } catch (err) {
    // Fail closed: if we cannot compute a verdict, the money does not move.
    return {
      result: false,
      verdict: 'REFUSED',
      reasonCodes: [CODES.REFUSED_BYPASS],
      errorMessage: 'Clear to Pay could not check this invoice, so it cannot be paid yet (REFUSED_BYPASS).',
    };
  }
  if (outcome?.verdict === 'CLEARED') {
    return { result: true, verdict: 'CLEARED', reasonCodes: [] };
  }
  const reasons = [...(outcome?.reasonCodes ?? []), CODES.REFUSED_BYPASS];
  return {
    result: false,
    // Keep precedence: a SEIZED invoice stays SEIZED; otherwise REFUSED.
    verdict: topVerdict(reasons),
    reasonCodes: reasons,
    errorMessage: `Clear to Pay blocked "Paid": ${reasons.join(', ')}`,
  };
}
