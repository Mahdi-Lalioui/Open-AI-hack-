/** Phone page /join: Feed / Pet / Play (pet) or Flip switch (circuit). */
import { useRef, useState } from 'react';
import type { InteractionKind } from '../../shared/creations';
import { NICKNAME_MAX } from '../../shared/validation';
import { useLiveState } from '../lib/useLiveState';
import { ApiClientError, newOrderId } from '../lib/api';
import { sendInteraction, type CreationStateFields } from '../lib/creationApi';

const PET_ACTIONS: { kind: InteractionKind; label: string; done: string }[] = [
  { kind: 'feed', label: 'Feed', done: 'Yum! Thanks for the snack.' },
  { kind: 'pet', label: 'Pet', done: 'Purr… that felt nice.' },
  { kind: 'play', label: 'Play', done: 'Wheee! Let’s play.' },
];

export function GuestPage() {
  const { state, connection } = useLiveState();
  const ext = (state ?? {}) as CreationStateFields;
  const creation = ext.creation ?? null;
  const [nickname, setNickname] = useState('');
  const [sending, setSending] = useState<InteractionKind | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const lock = useRef(false);

  async function send(kind: InteractionKind, done: string) {
    if (lock.current) return;
    lock.current = true;
    setSending(kind);
    setMsg(null);
    const id = newOrderId(); // one id per click, reused for the retry
    const input = { id, kind, nickname: nickname.trim() || undefined };
    try {
      try {
        await sendInteraction(input);
      } catch (e) {
        if (e instanceof ApiClientError && e.code === 'network') await sendInteraction(input);
        else throw e;
      }
      setMsg({ ok: true, text: done });
    } catch (e) {
      const rate = e instanceof ApiClientError && e.code === 'rate_limited';
      setMsg({ ok: false, text: rate ? 'Easy there! Try again in a moment.' : (e as Error).message });
    } finally {
      lock.current = false;
      setSending(null);
    }
  }

  const isCircuit = creation?.mode === 'circuit';
  const title = !creation ? 'Living Paper' : isCircuit ? 'Living Paper circuit' : creation.pet?.name || 'Living Paper pet';
  const pet = ext.pet;
  const circuit = ext.circuit;

  return (
    <div className="app guest">
      {connection === 'offline' && <p className="banner" role="status">Connection lost — reconnecting…</p>}
      <main className="guest-main">
        <p className="wordmark small">Living Paper</p>
        <h1 className="guest-title" data-testid="guest-title">{title}</h1>
        {!creation ? (
          <p className="guest-lead">The host is still drawing — check back in a moment.</p>
        ) : (
          <p className="guest-lead">{isCircuit ? 'Flip the switch and watch the big screen.' : `Look after ${title} — your taps show up on the big screen.`}</p>
        )}
        <label className="field guest-name">
          <span>Your name (optional)</span>
          <input type="text" maxLength={NICKNAME_MAX} value={nickname} onChange={(e) => setNickname(e.target.value)} data-testid="guest-nickname" autoComplete="nickname" />
        </label>
        {creation && (isCircuit ? (
          <button type="button" className="btn btn-coral btn-huge" data-testid="guest-toggle_switch" disabled={sending !== null}
            onClick={() => send('toggle_switch', 'Click! You flipped the switch.')}>
            {sending ? 'Sending…' : 'Flip switch'}
          </button>
        ) : (
          <div className="guest-actions">
            {PET_ACTIONS.map((a) => (
              <button key={a.kind} type="button" className="btn btn-coral btn-huge" data-testid={`guest-${a.kind}`} disabled={sending !== null}
                onClick={() => send(a.kind, a.done)}>
                {sending === a.kind ? 'Sending…' : a.label}
              </button>
            ))}
          </div>
        ))}
        <div aria-live="polite" data-testid="guest-confirmation">
          {msg && <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-error'}`}>{msg.text}</p>}
        </div>
        {pet && !isCircuit && (
          <p className="guest-live muted" data-testid="guest-live">Hunger {Math.round(pet.hunger)} · Happiness {Math.round(pet.happiness)} · Energy {Math.round(pet.energy)} · now {pet.action}</p>
        )}
        {circuit && isCircuit && (
          <p className="guest-live muted" data-testid="guest-live">Switch {circuit.switchClosed ? 'closed' : 'open'} · LED {circuit.ledOn ? 'on' : 'off'} · {circuit.currentMa.toFixed(1)} mA</p>
        )}
      </main>
    </div>
  );
}
