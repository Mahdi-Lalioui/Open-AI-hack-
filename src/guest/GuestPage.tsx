/** The audience's pocket-sized remote for the shared creation. */
import { useEffect, useRef, useState } from 'react';
import type { InteractionKind } from '../../shared/creations';
import { NICKNAME_MAX } from '../../shared/validation';
import { useLiveState } from '../lib/useLiveState';
import { ApiClientError, newOrderId } from '../lib/api';
import { sendInteraction } from '../lib/creationApi';
import { Icon, type IconName } from '../components/Icon';
import { ConnectionPill } from '../components/ConnectionPill';

const PET_ACTIONS: { kind: InteractionKind; label: string; description: string; icon: IconName; done: string }[] = [
  { kind: 'feed', label: 'Feed', description: 'A tiny snack. A happy little friend.', icon: 'food', done: 'Yum! Thanks for the snack.' },
  { kind: 'pet', label: 'Pet', description: 'Send a little love their way.', icon: 'heart', done: 'Purr… that felt nice.' },
  { kind: 'play', label: 'Play', description: 'Make some room for a little fun.', icon: 'play', done: 'Wheee! Let’s play.' },
];

export function GuestPage() {
  const { state, connection } = useLiveState();
  const creation = state?.creation ?? null;
  const [nickname, setNickname] = useState('');
  const [sending, setSending] = useState<InteractionKind | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cooling, setCooling] = useState(false);
  const lock = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (cooldown.current) clearTimeout(cooldown.current); }, []);

  async function send(kind: InteractionKind, done: string) {
    if (lock.current || cooling) return;
    lock.current = true;
    setSending(kind); setMsg(null);
    const input = { id: newOrderId(), kind, nickname: nickname.trim() || undefined };
    try {
      try { await sendInteraction(input); }
      catch (error) {
        if (error instanceof ApiClientError && error.code === 'network') await sendInteraction(input);
        else throw error;
      }
      setMsg({ ok: true, text: done });
      setCooling(true);
      cooldown.current = setTimeout(() => setCooling(false), 1550);
    } catch (error) {
      const rate = error instanceof ApiClientError && error.code === 'rate_limited';
      setMsg({ ok: false, text: rate ? 'Easy there! Try again in a moment.' : (error as Error).message });
    } finally { lock.current = false; setSending(null); }
  }

  const isCircuit = creation?.mode === 'circuit';
  const title = !creation ? 'A world is unfolding.' : isCircuit ? 'A little spark.' : creation.pet?.name || 'Your paper friend';
  const pet = state?.pet;
  const circuit = state?.circuit;
  const disabled = sending !== null || cooling || connection !== 'online';

  return <div className="app guest">
    {connection === 'offline' && <p className="banner" role="status">Connection lost — reconnecting…</p>}
    <header className="guest-topbar"><a className="brand" href="/" aria-label="Living Paper studio"><span className="brand-icon"><Icon name="paper" size={22} /></span><span className="wordmark">Living Paper<span className="brand-period">.</span></span></a><ConnectionPill connection={connection} /></header>
    <main className="guest-main">
      <div className={`guest-emblem ${isCircuit ? 'guest-emblem-circuit' : ''}`}><Icon name={isCircuit ? 'bolt' : 'heart'} size={38} /><span className="emblem-spark"><Icon name="spark" size={20} /></span></div>
      <p className="eyebrow">You’re part of the story</p>
      <h1 className="guest-title" data-testid="guest-title">{title}</h1>
      <p className="guest-lead">{!creation ? 'The host is making something wonderful. Your invitation is ready — just give it a moment.' : isCircuit ? 'Flip the switch. Follow the glow. Your taps come to life on the big screen.' : 'A little paper friend, brought to life. Send a little love and watch the big screen.'}</p>
      <label className="field guest-name"><span>Your name <span className="muted">(optional)</span></span><input type="text" maxLength={NICKNAME_MAX} value={nickname} placeholder="What should we call you?" onChange={(event) => setNickname(event.target.value)} data-testid="guest-nickname" autoComplete="nickname" /></label>
      {creation && (isCircuit ? <button type="button" className="btn guest-action guest-action-switch" data-testid="guest-toggle_switch" disabled={disabled} onClick={() => send('toggle_switch', 'Click! You flipped the switch.')}>
        <span className="guest-action-icon"><Icon name="switch" size={28} /></span><span><strong>{sending ? 'Sending…' : 'Flip switch'}</strong><small>A little connection. A little light.</small></span><Icon name="arrow" size={22} />
      </button> : <div className="guest-actions">{PET_ACTIONS.map((action) => <button key={action.kind} type="button" className={`btn guest-action guest-action-${action.kind}`} data-testid={`guest-${action.kind}`} disabled={disabled} onClick={() => send(action.kind, action.done)}>
        <span className="guest-action-icon"><Icon name={action.icon} size={27} /></span><span><strong>{sending === action.kind ? 'Sending…' : action.label}</strong><small>{action.description}</small></span><Icon name="arrow" size={20} />
      </button>)}</div>)}
      <div aria-live="polite" data-testid="guest-confirmation">{msg && <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-error'}`}>{msg.ok && <Icon name="check" size={17} />}{msg.text}</p>}</div>
      {pet && !isCircuit && <div className="guest-live" data-testid="guest-live"><span className="eyebrow"><span className="status-dot" />Live from the paper stage</span><p>Hunger <strong>{Math.round(pet.hunger)}</strong> · Happiness <strong>{Math.round(pet.happiness)}</strong> · Energy <strong>{Math.round(pet.energy)}</strong></p><span className="guest-now">Now: {pet.action}</span></div>}
      {circuit?.result && isCircuit && <div className="guest-live" data-testid="guest-live"><span className="eyebrow"><span className="status-dot" />Live from the paper stage</span><p>Switch <strong>{circuit.switchClosed ? 'closed' : 'open'}</strong> · LED {circuit.result.ledOn ? 'on' : 'off'} · <strong>{circuit.result.currentMa.toFixed(1)} mA</strong></p></div>}
      <p className="guest-footer">Small gestures. A world of difference.</p>
    </main>
  </div>;
}
