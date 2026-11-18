// Clear to Pay issue panel.
//
// The panel only SHOWS results and collects inputs. Every rule is enforced
// on the server (the Forge resolver and the workflow validator). Blind counts
// are never displayed: you can see that the other role has signed, never
// what they counted.

import React, { useCallback, useEffect, useState } from 'react';
import { events, invoke } from '@forge/bridge';
import { createKey, setKeyId, hasKey, sign } from './keys';
import { deliveryPayload } from './payload';
import './App.css';

// Plain-language meaning of every reason code in this slice.
const RULES = [
  ['SEIZED_PAYEE_NOT_REGISTERED', 'Pays only the supplier\'s registered bank account'],
  ['HELD_PAYOUT_COOL_OFF', 'New bank accounts wait 72 hours'],
  ['HELD_ONE_SIGNATURE', 'Storekeeper and weighbridge (two different people) both signed'],
  ['HELD_COUNT_MISMATCH', 'The two blind counts agree'],
  ['HELD_AI_READING_ONLY', 'A human, not just the AI, has cleared it'],
  ['REFUSED_BYPASS', '"Paid" is blocked unless every check passes'],
];

const statusOf = (code, fired) => {
  if (!fired.includes(code)) return 'pass';
  return code.startsWith('HELD_') ? 'hold' : 'fail';
};

function useAction(refresh) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const run = async (label, fn) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      if (res && res.ok === false) throw new Error(res.error);
      setMessage({ kind: 'ok', text: `${label}: done` });
      await refresh();
    } catch (err) {
      setMessage({ kind: 'error', text: `${label}: ${err.message || err}` });
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run };
}

export default function App() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ supplierId: '', named: '', routeAccount: '', role: 'storekeeper', count: '', ai: '' });
  const [myKeys, setMyKeys] = useState({});

  const refresh = useCallback(async () => {
    const res = await invoke('getState');
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setState(res.data);
    const me = res.data.me;
    setMyKeys({
      storekeeper: await hasKey(me, 'storekeeper').catch(() => false),
      weighbridge: await hasKey(me, 'weighbridge').catch(() => false),
    });
  }, []);

  useEffect(() => {
    refresh();
    const sub = events.on('JIRA_ISSUE_CHANGED', refresh);
    return () => sub.then((s) => s.unsubscribe());
  }, [refresh]);

  const { busy, message, run } = useAction(refresh);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (loadError) return <div className="ctp"><p className="msg error">Could not load: {loadError}</p></div>;
  if (!state) return <div className="ctp"><p>Loading…</p></div>;

  const fired = state.reasonCodes;
  const me = state.me;
  const role = form.role;

  return (
    <div className="ctp">
      <header className="head">
        <span className={`verdict v-${state.verdict.toLowerCase()}`}>{state.verdict}</span>
        <span className="sub">
          {state.verdict === 'CLEARED' ? `Pays only ${state.payoutAccount}` : 'Cannot move to "Paid" yet'}
        </span>
      </header>

      <ul className="rules">
        {RULES.map(([code, text]) => {
          // Rule 21 is about the move to "Paid": it bites whenever the verdict is not CLEARED.
          const s = code === 'REFUSED_BYPASS' ? (state.verdict === 'CLEARED' ? 'pass' : 'guard') : statusOf(code, fired);
          return (
            <li key={code} className={`rule r-${s}`}>
              <span className="dot" aria-hidden="true" />
              <span className="text">{text}</span>
              <code>{code}</code>
            </li>
          );
        })}
      </ul>
      {state.payableFrom && fired.includes('HELD_PAYOUT_COOL_OFF') && (
        <p className="note">Bank account payable from {new Date(state.payableFrom).toLocaleString()}</p>
      )}

      {message && <p className={`msg ${message.kind}`}>{message.text}</p>}

      <section>
        <h3>1. Invoice</h3>
        <p className="note">Supplier: <b>{state.invoice.supplierId || 'not set'}</b>{state.invoice.namedBankAccount ? ` · names account ${state.invoice.namedBankAccount}` : ''}</p>
        <div className="row">
          <input placeholder="Supplier ID (e.g. SUP-ACME)" value={form.supplierId} onChange={set('supplierId')} />
          <input placeholder="Bank account printed on the invoice (optional)" value={form.named} onChange={set('named')} />
          <button disabled={busy} onClick={() => run('Save invoice', () => invoke('setInvoice', { supplierId: form.supplierId, namedBankAccount: form.named || null }))}>Save</button>
        </div>
        {!state.supplierKnown && (
          <div className="row">
            <input placeholder="Supplier's registered bank account" value={form.routeAccount} onChange={set('routeAccount')} />
            <button disabled={busy} onClick={() => run('Register supplier', () => invoke('registerSupplierRoute', { supplierId: form.supplierId || state.invoice.supplierId, account: form.routeAccount }))}>Register supplier</button>
          </div>
        )}
      </section>

      <section>
        <h3>2. Delivery (blind counts)</h3>
        <p className="note">Signed so far: {state.signedRoles.length ? state.signedRoles.join(' + ') : 'nobody'}. You never see the other person's count.</p>
        <div className="row">
          <select value={role} onChange={set('role')}>
            <option value="storekeeper">I am the storekeeper</option>
            <option value="weighbridge">I am the weighbridge operator</option>
          </select>
          {!myKeys[role] ? (
            <button disabled={busy} onClick={() => run('Create signing key', async () => {
              const { publicKeySpkiB64 } = await createKey(me, role);
              const res = await invoke('registerKey', { role, publicKeySpkiB64 });
              if (res.ok) await setKeyId(me, role, res.data.keyId);
              return res;
            })}>Create my {role} key</button>
          ) : (
            <>
              <input type="number" min="0" placeholder="What you counted" value={form.count} onChange={set('count')} />
              <button disabled={busy || form.count === ''} onClick={() => run('Sign count', async () => {
                const payload = deliveryPayload({ issueKey: state.invoice.issueKey, deliveryId: state.deliveryId, role, signerAccountId: me, count: Number(form.count) });
                return invoke('submitDeliverySignature', await sign(me, role, payload));
              })}>Sign my count</button>
            </>
          )}
        </div>
      </section>

      <section>
        <h3>3. AI reading and approval</h3>
        <p className="note">AI reading: {state.aiReadingPresent ? 'present (advice only, it can never pay)' : 'none'} · Buyer approval: {state.approvedBy ? 'recorded' : 'none'}</p>
        <div className="row">
          <input placeholder="AI reading summary (Rovo comes next slice)" value={form.ai} onChange={set('ai')} />
          <button disabled={busy} onClick={() => run('Save AI reading', () => invoke('setAiReading', { summary: form.ai }))}>Save AI reading</button>
          <button disabled={busy} onClick={() => run('Approve', () => invoke('recordApproval'))}>Approve as buyer</button>
        </div>
      </section>
    </div>
  );
}
