/** Right column live readout: pet needs + action, or circuit current / LED / warnings + switch. */
import { useState } from 'react';
import type { CircuitResult, PetState, SketchMode } from '../../shared/creations';
import { newOrderId } from '../lib/api';
import { sendInteraction } from '../lib/creationApi';
import { Card } from '../components/Card';

function Bar({ label, value, testId, invert }: { label: string; value: number; testId: string; invert?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const bad = invert ? v > 70 : v < 30;
  return (
    <div className="bar-row">
      <div className="bar-head"><span>{label}</span><span className="num" data-testid={testId} data-value={v}>{v}</span></div>
      <div className={`bar ${bad ? 'bar-bad' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <span style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function ReadoutCard({ mode, pet, circuit, petName, switchClosed }: { mode: SketchMode; pet: PetState | null; circuit: CircuitResult | null; petName?: string; switchClosed?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function flip() {
    setErr(null); setBusy(true);
    try { await sendInteraction({ id: newOrderId(), kind: 'toggle_switch' }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  if (mode === 'pet') {
    return (
      <Card id="readout" title={petName ? `${petName}’s needs` : 'Pet needs'}>
        {pet ? (
          <>
            <Bar label="Hunger" value={pet.hunger} testId="pet-hunger" invert />
            <Bar label="Happiness" value={pet.happiness} testId="pet-happiness" />
            <Bar label="Energy" value={pet.energy} testId="pet-energy" />
            <p className="readout-line">Now: <strong data-testid="pet-action">{pet.action}</strong></p>
            <p className="muted small">Fed {pet.counts.feed} · petted {pet.counts.pet} · played {pet.counts.play}{pet.lastBy ? ` · last by ${pet.lastBy}` : ''}</p>
          </>
        ) : <p className="muted">Build a pet to see its needs.</p>}
      </Card>
    );
  }
  return (
    <Card id="readout" title="Circuit readout">
      {circuit ? (
        <>
          <dl className="metrics-grid">
            <div className="metric"><dt>Current</dt><dd className="metric-value num" data-testid="circuit-current" data-value={circuit.currentMa}>{circuit.currentMa.toFixed(1)} mA</dd></div>
            <div className={`metric ${circuit.ledOn ? 'metric-teal' : ''}`}><dt>LED</dt><dd className="metric-value" data-testid="circuit-led">{circuit.ledOn ? 'On' : 'Off'}</dd></div>
          </dl>
          <p className="readout-line" data-testid="circuit-message">{circuit.message}</p>
          {circuit.warnings.length > 0 && <ul className="msg msg-warn" data-testid="circuit-warnings">{circuit.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <button type="button" className="btn btn-primary" data-testid="circuit-switch" onClick={flip} disabled={busy}>
            Switch is {(switchClosed ?? circuit.switchClosed) ? 'closed' : 'open'} — flip it
          </button>
          <p className="muted small">Series DC calculation from the values on your drawing (defaults where none written).</p>
        </>
      ) : <p className="muted">Build a circuit to see the readout.</p>}
      <div aria-live="polite">{err && <p className="msg msg-error">{err}</p>}</div>
    </Card>
  );
}
