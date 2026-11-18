// Forge entry points.
//
//  - `handler`  : the resolver the issue panel calls (via @forge/bridge invoke).
//  - `validate` : the jira:workflowValidator that guards the move to "Paid".
//
// Data lives in Forge Key-Value Storage (kvs). Nothing leaves Atlassian.
// The acting user ALWAYS comes from req.context.accountId, never the browser.

import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import {
  evaluateIssue,
  setInvoice,
  registerSupplierRoute,
  registerKey,
  revokeKey,
  submitDeliverySignature,
  recordApproval,
  setAiReading,
  deliveryIdFor,
} from './app.js';
import { guardPaidTransition } from './functions/validator.js';

// A thin adapter so the service layer sees a plain get / set / delete store.
const store = {
  get: (key) => kvs.get(key),
  set: (key, value) => kvs.set(key, value),
  delete: (key) => kvs.delete(key),
};

const resolver = new Resolver();

// The issue key comes from where the panel is open, never from the payload.
const issueKeyOf = (req) => req.context.extension.issue.key;
const who = (req) => req.context.accountId;

// Wrap each action so errors come back as { error } the panel can display.
const action = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
};

resolver.define('getState', action(async (req) => ({
  me: who(req),
  deliveryId: deliveryIdFor(issueKeyOf(req)),
  ...(await evaluateIssue(store, issueKeyOf(req), Date.now())),
})));

resolver.define('setInvoice', action((req) => setInvoice(store, issueKeyOf(req), req.payload)));
resolver.define('registerSupplierRoute', action((req) => registerSupplierRoute(store, req.payload, Date.now())));
resolver.define('registerKey', action((req) => registerKey(store, who(req), req.payload, Date.now())));
resolver.define('revokeKey', action((req) => revokeKey(store, who(req), req.payload, Date.now())));
resolver.define('submitDeliverySignature', action((req) => submitDeliverySignature(store, issueKeyOf(req), who(req), req.payload)));
resolver.define('recordApproval', action((req) => recordApproval(store, issueKeyOf(req), who(req), Date.now())));
resolver.define('setAiReading', action((req) => setAiReading(store, issueKeyOf(req), req.payload)));

export const handler = resolver.getDefinitions();

/**
 * Workflow validator. Jira calls this for every transition that has the
 * validator attached, whatever started it (UI, REST API, automation, bulk).
 * It recomputes the verdict right now and fails closed.
 */
export async function validate(event) {
  const issueKey = event?.issue?.key;
  const decision = await guardPaidTransition(async () => {
    if (!issueKey) throw new Error('no issue key in validator event');
    return evaluateIssue(store, issueKey, Date.now());
  });
  return decision.result ? { result: true } : { result: false, errorMessage: decision.errorMessage };
}
