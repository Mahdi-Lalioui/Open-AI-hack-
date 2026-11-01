/** Ask the pet (Decisions API or labelled example rule) and customize its skin (image API). */
import { useState } from 'react';
import type { PublicState } from '../../shared/types';
import { api } from '../lib/api';
import { beanSourceLabel } from '../lib/format';
import { Card } from '../components/Card';

export function AskCard({ state, petName }: { state: PublicState | null; petName: string }) {
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const bean = state?.bean;
  const d = bean?.lastDecision ?? null;
  const thinking = asking || Boolean(bean?.thinking);
  const image = bean?.image;
  const imageOk = Boolean(state && state.api.image.state !== 'not_configured');
  const custom = image?.status === 'ready' && image.url;

  async function ask() {
    setErr(null); setAsking(true);
    try { await api.askBean(); } catch (e) { setErr((e as Error).message); } finally { setAsking(false); }
  }
  async function skin() {
    setImgErr(null); setImgBusy(true);
    try { await api.generateBeanImage(); } catch (e) { setImgErr((e as Error).message); } finally { setImgBusy(false); }
  }

  return (
    <Card id="ask" title={`Ask ${petName}`}>
      <div className="decision" data-testid="bean-action" data-source={d?.source ?? ''}>
        {d ? (
          <>
            <div className="decision-head"><span className={`source-badge source-${d.source}`}>{beanSourceLabel(d)}</span></div>
            <p className="decision-why">{d.explanation}</p>
          </>
        ) : <p className="muted">Not asked yet.</p>}
      </div>
      <button type="button" className="btn btn-primary" data-testid="ask-bean" onClick={ask} disabled={!state || thinking}>
        {thinking ? `${petName} is thinking…` : `Ask ${petName}`}
      </button>
      <div aria-live="polite">
        {err && <p className="msg msg-error">{err}</p>}
        {!err && bean?.lastError && <p className="msg msg-error">{bean.lastError}</p>}
      </div>
      <div className="customize">
        {custom && <img src={image!.url} alt="Custom skin" className="bean-thumb" />}
        <p className="bean-version" data-testid="bean-version">In use: {custom ? 'Custom skin — 2D picture from image generation on a 3D stand' : 'Default 3D look from your sketch'}</p>
        <button type="button" className="btn btn-ghost" data-testid="customize-bean" onClick={skin} disabled={!imageOk || imgBusy || image?.status === 'loading'}>
          {imgBusy || image?.status === 'loading' ? 'Drawing skin…' : 'Customize skin'}
        </button>
        <div aria-live="polite">
          {!imageOk && state && <p className="muted small">Needs an OPENAI_API_KEY on the server.</p>}
          {(imgErr || image?.status === 'error') && <p className="msg msg-error">Couldn’t draw a skin: {imgErr ?? image?.error}. The default look stays.</p>}
        </div>
      </div>
    </Card>
  );
}
