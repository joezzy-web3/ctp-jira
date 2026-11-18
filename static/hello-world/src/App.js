// Clear to Pay issue panel.
//
// The panel only SHOWS results and collects inputs. Every rule is enforced
// on the server (the Forge resolver and the workflow validator). Blind counts
// are never displayed: you can see that the other role has signed, never
// what they counted.
//
// Look and feel: two themes over one product. "kiroween" (moonlit graveyard,
// the living tattered flag, opt-in sound, three spookiness levels) and
// "standard" (navy and gold). Themes change words, colours and motion only,
// never a rule.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { events, invoke } from '@forge/bridge';
import '@fontsource/creepster/400.css';
import { createKey, setKeyId, hasKey, sign } from './keys';
import { deliveryPayload } from './payload';
import { Flag, Scene, Spider } from './Scene';
import { play, startWind, stopWind } from './sound';
import { loadPrefs, savePrefs } from './prefs';
import { Icon } from './Icons';
import './App.css';

// [code, plain label, spooky label (haunted only), Kiroween icon class]
const RULES = [
  ['SEIZED_PAYEE_NOT_REGISTERED', 'Pays only the registered account', 'No ghost supplier haunts this payee', 'ghost'],
  ['HELD_PAYOUT_COOL_OFF', 'New bank account waits 72 hours', 'Fresh grave: it rests 72 hours', 'grave'],
  ['HELD_ONE_SIGNATURE', 'Storekeeper and weighbridge both signed', 'Two living witnesses must sign', 'candle'],
  ['HELD_COUNT_MISMATCH', 'Blind counts agree', 'No one peeked: the counts agree', 'eye'],
  ['HELD_AI_READING_ONLY', 'A person cleared it, not only the AI', 'The crystal ball cannot pay alone', 'ball'],
  ['REFUSED_BYPASS', '"Paid" is locked until all pass', 'The crypt door bars every bypass', 'lock'],
];

const VERDICT_LINE = {
  CLEARED: ['Ready to pay', 'The spirits are at rest'],
  HELD: ['Not payable yet', 'The spirits are not satisfied'],
  SEIZED: ['Blocked: looks like fraud', 'A ghost supplier was caught'],
  REFUSED: ['Blocked', 'The crypt door holds'],
};

const COOL_OFF_MS = 72 * 60 * 60 * 1000;

function ruleStatus(code, fired, verdict) {
  if (code === 'REFUSED_BYPASS') return verdict === 'CLEARED' ? 'pass' : 'hold';
  if (!fired.includes(code)) return 'pass';
  return code.startsWith('HELD_') ? 'hold' : 'fail';
}

function holdText(payableFrom) {
  const left = payableFrom - Date.now();
  const when = new Date(payableFrom).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (left <= 0) return { label: `Payable since ${when}`, pct: 100 };
  const h = Math.ceil(left / 3_600_000);
  return { label: `${h} h left · payable ${when}`, pct: Math.max(2, Math.min(100, 100 - (left / COOL_OFF_MS) * 100)) };
}

export default function App() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState({ supplierId: '', named: '', routeAccount: '', role: 'storekeeper', count: '', ai: '' });
  const [myKeys, setMyKeys] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  const lastVerdict = useRef(null);

  const kiro = prefs.theme === 'kiroween';
  const level = kiro ? prefs.level : 'calm';
  const spooky = kiro && level === 'haunted';
  const soundOn = kiro && prefs.sound;

  const updatePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  // Latest sound setting, readable from inside the (stable) refresh callback.
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const refresh = useCallback(async (fromAction = false) => {
    const res = await invoke('getState');
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setLoadError(null);
    setState(res.data);
    // A sound plays only when the verdict CHANGES because of something the
    // user just did, never on page load.
    if (fromAction && lastVerdict.current && lastVerdict.current !== res.data.verdict) {
      if (soundOnRef.current) play(res.data.verdict === 'CLEARED' ? 'cleared' : res.data.verdict === 'HELD' ? 'held' : 'seized');
    }
    lastVerdict.current = res.data.verdict;
    const me = res.data.me;
    setMyKeys({
      storekeeper: await hasKey(me, 'storekeeper').catch(() => false),
      weighbridge: await hasKey(me, 'weighbridge').catch(() => false),
    });
  }, []);

  useEffect(() => {
    refresh();
    const sub = events.on('JIRA_ISSUE_CHANGED', () => refresh());
    return () => sub.then((s) => s.unsubscribe());
  }, [refresh]);

  // Night wind only in haunted mode, only with sound on.
  useEffect(() => {
    if (soundOn && level === 'haunted') startWind();
    else stopWind();
    return () => stopWind();
  }, [soundOn, level]);

  const run = async (label, fn, cue) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fn();
      if (res && res.ok === false) throw new Error(res.error);
      setMessage({ kind: 'ok', text: `${label}: done` });
      if (cue && soundOn) play(cue);
      await refresh(true);
    } catch (err) {
      setMessage({ kind: 'error', text: `${label}: ${err.message || err}` });
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const rootClass = `ctp theme-${prefs.theme} lvl-${level}`;
  if (loadError) return <div className={rootClass}><p className="msg error">Could not load: {loadError}</p></div>;
  if (!state) return <div className={rootClass}><p className="note pad">Loading…</p></div>;

  const fired = state.reasonCodes;
  const me = state.me;
  const role = form.role;
  const verdict = state.verdict;
  const line = VERDICT_LINE[verdict] || VERDICT_LINE.HELD;
  const subtitle = `${state.invoice.issueKey}${state.invoice.supplierId ? ` · ${state.invoice.supplierId}` : ''}`;
  const hold = state.payableFrom && fired.includes('HELD_PAYOUT_COOL_OFF') ? holdText(state.payableFrom) : null;
  const showScene = kiro && level !== 'calm';
  const showSpider = showScene && (verdict === 'HELD' || verdict === 'SEIZED');

  return (
    <div className={rootClass}>
      {showScene ? (
        <Scene title="Clear to Pay" subtitle={subtitle} haunted={level === 'haunted'} />
      ) : (
        <header className="brand">
          <Flag alive={kiro} size={30} />
          <div>
            <div className="brand-title">Clear to Pay</div>
            <div className="note">{subtitle}</div>
          </div>
        </header>
      )}

      <div className="body">
        {showSpider && <Spider />}

        <div className="verdict-row">
          <span className={`verdict v-${verdict.toLowerCase()}`}>{verdict === 'CLEARED' ? 'Cleared' : verdict.charAt(0) + verdict.slice(1).toLowerCase()}</span>
          <span className="note">{spooky ? line[1] : line[0]}</span>
        </div>
        {verdict === 'CLEARED' && <p className="note">Pays only {state.payoutAccount}</p>}

        {hold && (
          <div className="hold">
            <div className="hold-top"><span>New bank account hold</span><span className="note">{hold.label}</span></div>
            <div className="bar"><div style={{ width: `${hold.pct}%` }} /></div>
          </div>
        )}

        <ul className="rules">
          {RULES.map(([code, plain, ghostly, icon]) => {
            const s = ruleStatus(code, fired, verdict);
            return (
              <li key={code} className={`rule r-${s}`}>
                {kiro ? <span className="ico"><Icon name={icon} /></span> : <span className="dot" aria-hidden="true" />}
                <span>{spooky ? ghostly : plain}</span>
                <code>{code}</code>
              </li>
            );
          })}
        </ul>

        {message && <p className={`msg ${message.kind}`}>{message.text}</p>}

        <section>
          <h3>Blind counts</h3>
          <div className="seals">
            {['storekeeper', 'weighbridge'].map((r) => (
              <div key={r} className={`seal ${state.signedRoles.includes(r) ? 'sealed' : ''}`}>
                <span aria-hidden="true">{state.signedRoles.includes(r) ? '◆' : '◇'}</span>
                {r === 'storekeeper' ? 'Storekeeper' : 'Weighbridge'} · {state.signedRoles.includes(r) ? 'sealed' : 'waiting'}
              </div>
            ))}
          </div>
          <div className="row">
            <select value={role} onChange={set('role')}>
              <option value="storekeeper">I am the storekeeper</option>
              <option value="weighbridge">I am the weighbridge operator</option>
            </select>
            {!myKeys[role] ? (
              <button className="primary" disabled={busy} onClick={() => run('Create signing key', async () => {
                const { publicKeySpkiB64 } = await createKey(me, role);
                const res = await invoke('registerKey', { role, publicKeySpkiB64 });
                if (res.ok) await setKeyId(me, role, res.data.keyId);
                return res;
              })}>Create my {role} key</button>
            ) : (
              <>
                <input type="number" min="0" placeholder="What you counted" value={form.count} onChange={set('count')} />
                <button className="primary" disabled={busy || form.count === ''} onClick={() => run('Seal count', async () => {
                  const payload = deliveryPayload({ issueKey: state.invoice.issueKey, deliveryId: state.deliveryId, role, signerAccountId: me, count: Number(form.count) });
                  return invoke('submitDeliverySignature', await sign(me, role, payload));
                }, 'seal')}>{spooky ? 'Seal it in wax' : 'Seal my count'}</button>
              </>
            )}
          </div>
          <p className="note small">Sealed counts are never shown, not even to the other signer</p>
        </section>

        <section>
          <h3>Invoice</h3>
          <div className="row">
            <input placeholder="Supplier ID, like SUP-ACME" value={form.supplierId} onChange={set('supplierId')} />
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
          <h3>AI reading and approval</h3>
          <p className="note">AI reading: {state.aiReadingPresent ? 'present, advice only' : 'none'} · Buyer approval: {state.approvedBy ? 'recorded' : 'none'}</p>
          <div className="row">
            <input placeholder="AI reading summary" value={form.ai} onChange={set('ai')} />
            <button disabled={busy} onClick={() => run('Save AI reading', () => invoke('setAiReading', { summary: form.ai }), 'crystal')}>Save AI reading</button>
            <button disabled={busy} onClick={() => run('Approve', () => invoke('recordApproval'))}>Approve as buyer</button>
          </div>
        </section>

        <footer className="prefs">
          <label>
            Theme{' '}
            <select value={prefs.theme} onChange={(e) => updatePrefs({ theme: e.target.value })}>
              <option value="kiroween">Kiroween</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          {kiro && (
            <div className="seg" role="group" aria-label="Spookiness">
              {['calm', 'balanced', 'haunted'].map((l) => (
                <button key={l} className={prefs.level === l ? 'on' : ''} onClick={() => updatePrefs({ level: l })}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
          )}
          {kiro && (
            <button
              className="sound-btn"
              aria-pressed={soundOn}
              onClick={() => {
                updatePrefs({ sound: !prefs.sound });
                if (!prefs.sound) play('crystal');
              }}
            >
              <Icon name={soundOn ? 'soundOn' : 'soundOff'} /> {soundOn ? 'Sound on' : 'Sound off'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
