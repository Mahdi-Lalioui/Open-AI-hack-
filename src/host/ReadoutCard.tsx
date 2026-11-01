/** Live needs, real host interactions, and an honest series-circuit readout. */
import { useEffect, useRef, useState } from 'react';
import type { CircuitResult, InteractionKind, PetState, SketchMode } from '../../shared/creations';
import { newOrderId } from '../lib/api';
import { sendInteraction } from '../lib/creationApi';
import { Card } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';

const PET_ACTIONS: { kind: InteractionKind; label: string; icon: IconName; done: string }[] = [
  { kind: 'feed', label: 'Feed', icon: 'food', done: 'You fed it, and its hunger has gone down.' },
  { kind: 'pet', label: 'Pet', icon: 'heart', done: 'You gave it some attention, and it looks happier for it.' },
  { kind: 'play', label: 'Play', icon: 'play', done: 'You played with it, so watch it react on the stage.' },
];

function Bar({ label, value, testId, invert }: { label: string; value: number; testId: string; invert?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const bad = invert ? v > 70 : v < 30;
  return <div className="bar-row">
    <div className="bar-head"><span>{label}</span><span className="num" data-testid={testId} data-value={v}>{v}<small>/100</small></span></div>
    <div className={`bar ${bad ? 'bar-bad' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><span style={{ width: `${v}%` }} /></div>
  </div>;
}

export function ReadoutCard({ mode, pet, circuit, petName, switchClosed, connected = true }: { mode: SketchMode; pet: PetState | null; circuit: CircuitResult | null; petName?: string; switchClosed?: boolean; connected?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<InteractionKind | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false);
  const lock = useRef(false);
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (cooldown.current) clearTimeout(cooldown.current); }, []);

  async function interact(kind: InteractionKind, done: string) {
    if (lock.current || cooling) return;
    lock.current = true;
    setErr(null); setBusy(kind); setConfirmation(null);
    try {
      await sendInteraction({ id: newOrderId(), kind, nickname: 'Presenter' });
      setConfirmation(done);
      // Match the server's per-person limit while the pet responds to the last gesture.
      setCooling(true);
      cooldown.current = setTimeout(() => setCooling(false), 1550);
    } catch (error) { setErr((error as Error).message); }
    finally { lock.current = false; setBusy(null); }
  }

  return <Card id="readout" className={`readout-card ${mode === 'circuit' ? 'circuit-readout' : ''}`} title={mode === 'pet' ? petName ? `How ${petName} is doing` : 'How it is doing' : 'Circuit readout'} aside={<span className="card-kicker">{mode === 'pet' ? 'LIVE NEEDS' : 'LIVE CIRCUIT'}</span>}>
    {mode === 'pet' ? pet ? <>
      <div className="pet-current-action"><span className="status-dot" /><span>Right now</span><strong data-testid="pet-action">{pet.action}</strong></div>
      <Bar label="Hunger" value={pet.hunger} testId="pet-hunger" invert />
      <Bar label="Happiness" value={pet.happiness} testId="pet-happiness" />
      <Bar label="Energy" value={pet.energy} testId="pet-energy" />
      <div className="host-actions" role="group" aria-label="Interact with your pet">
        {PET_ACTIONS.map((action) => <button key={action.kind} type="button" className="btn btn-pet-action" data-testid={`host-${action.kind}`} onClick={() => interact(action.kind, action.done)} disabled={!connected || busy !== null || cooling}>
          <Icon name={action.icon} size={21} /><span>{busy === action.kind ? 'Sending…' : action.label}</span>
        </button>)}
      </div>
      <p className="pet-counts">Fed {pet.counts.feed} · petted {pet.counts.pet} · played {pet.counts.play}{pet.lastBy ? <><br /><span>Last visit from {pet.lastBy}</span></> : null}</p>
    </> : <div className="readout-empty"><Icon name="heart" size={27} /><p>Starting the live test…</p><span>Its needs will appear here, and they change as you feed it and play with it.</span></div>
      : circuit ? <>
        <dl className="metrics-grid">
          <div className="metric"><dt>Current</dt><dd className="metric-value num" data-testid="circuit-current" data-value={circuit.currentMa}>{circuit.currentMa.toFixed(1)} <small>mA</small></dd></div>
          <div className={`metric ${circuit.ledOn ? 'metric-teal' : ''}`}><dt>LED</dt><dd className="metric-value" data-testid="circuit-led">{circuit.ledOn ? 'On' : 'Off'}</dd></div>
        </dl>
        <p className="readout-line" data-testid="circuit-message">{circuit.message}</p>
        {circuit.warnings.length > 0 && <ul className="msg msg-warn" data-testid="circuit-warnings">{circuit.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <button type="button" className="btn btn-primary circuit-switch" data-testid="circuit-switch" onClick={() => interact('toggle_switch', 'You flipped the switch, and the stage shows the new current.')} disabled={!connected || busy !== null || cooling}>
          <Icon name="switch" size={21} />{busy ? 'Switching…' : `The switch is ${(switchClosed ?? circuit.switchClosed) ? 'closed, so tap to open it' : 'open, so tap to close it'}`}
        </button>
        <p className="footnote">This is a series DC calculation using the values in your design, with sensible defaults for anything you left blank.</p>
      </> : <div className="readout-empty"><Icon name="bolt" size={27} /><p>Starting the live test…</p><span>The current and LED will appear here once the circuit is running.</span></div>}
    <div aria-live="polite" data-testid="host-confirmation">{err ? <p className="msg msg-error">{err}</p> : confirmation ? <p className="interaction-confirmation"><Icon name="check" size={15} />{confirmation}</p> : null}</div>
  </Card>;
}
