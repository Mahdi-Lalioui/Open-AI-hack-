import { useRef, useState, type ChangeEvent } from 'react';
import type { CreationConfig } from '../../shared/creations';
import { Card } from '../components/Card';
import { buildCreation } from '../lib/creationApi';
import { downloadFile, MAX_BLUEPRINT_BYTES, parseBlueprint, serializeBlueprint } from '../lib/blueprintFile';

export function BlueprintPanel({ creation, connected, creating = false, onBusyChange }: { creation: CreationConfig | null; connected: boolean; creating?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const lock = useRef(false);

  function save() {
    if (!creation) return;
    try {
      const file = serializeBlueprint(creation);
      downloadFile(new Blob([file.contents], { type: 'application/json' }), file.filename);
      setMessage({ ok: true, text: 'Blueprint saved. Open it here to keep creating.' });
    } catch (e) { setMessage({ ok: false, text: (e as Error).message }); }
  }

  async function open(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || lock.current || creating) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setMessage(null);
    try {
      if (file.size > MAX_BLUEPRINT_BYTES) throw new Error('Blueprint files must be under 128 KB.');
      const design = parseBlueprint(await file.text());
      await buildCreation(design);
      setMessage({ ok: true, text: 'Blueprint imported. Your creation is live on the stage.' });
    } catch (err) { setMessage({ ok: false, text: (err as Error).message }); }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }

  return (
    <Card id="blueprint" title="Keep your creation" className="blueprint-card">
      <p className="muted small">A real, editable blueprint. Save it, share the file, bring it back.</p>
      <div className="blueprint-actions">
        <button type="button" className="btn btn-secondary" data-testid="blueprint-download" disabled={!creation || busy} onClick={save}>Save blueprint</button>
        <label className={`btn btn-ghost file-btn ${busy || creating || !connected ? 'is-disabled' : ''}`}>
          <input type="file" accept=".json,application/json" className="file-input" data-testid="blueprint-import" disabled={!connected || busy || creating} onChange={open} />
          {busy ? 'Opening…' : 'Open blueprint'}
        </label>
      </div>
      <div aria-live="polite" data-testid="blueprint-status">
        {message && <p className={`msg ${message.ok ? 'msg-ok' : 'msg-error'}`}>{message.text}</p>}
      </div>
    </Card>
  );
}
