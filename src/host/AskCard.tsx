/** Bounded pet decisions and an honestly labelled generated portrait. */
import { useState } from 'react';
import type { PublicState } from '../../shared/types';
import { api } from '../lib/api';
import { beanSourceLabel } from '../lib/format';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';

export function AskCard({ state, petName }: { state: PublicState | null; petName: string }) {
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const bean = state?.bean;
  const decision = bean?.lastDecision ?? null;
  const thinking = asking || Boolean(bean?.thinking);
  const image = bean?.image;
  const hasPet = state?.creation?.mode === 'pet';
  const imageOk = Boolean(hasPet && state && state.api.image.state !== 'not_configured');
  const custom = image?.status === 'ready' && image.url;

  async function ask() {
    setErr(null); setAsking(true);
    try { await api.askBean(); } catch (error) { setErr((error as Error).message); } finally { setAsking(false); }
  }
  async function portrait() {
    setImgErr(null); setImgBusy(true);
    try { await api.generateBeanImage(); } catch (error) { setImgErr((error as Error).message); } finally { setImgBusy(false); }
  }

  return <Card id="ask" title="A mind of its own" className="ask-card" aside={<Icon name="spark" size={18} />}>
    <div className="decision" data-testid="bean-action" data-source={decision?.source ?? ''}>
      {decision ? <>
        <span className={`source-badge source-${decision.source}`}>{beanSourceLabel(decision)}</span>
        <p className="decision-why">{decision.explanation}</p>
        {!decision.applied && decision.notAppliedReason && <p className="decision-rejected" data-testid="decision-not-applied">{decision.notAppliedReason}</p>}
      </> : <p className="muted">A snack? A nap? Let {petName} choose what comes next.</p>}
    </div>
    <button type="button" className="btn btn-secondary ask-button" data-testid="ask-bean" onClick={ask} disabled={!hasPet || thinking}>
      <Icon name="spark" size={17} />{thinking ? `${petName} is thinking…` : `Ask ${petName}`}<Icon name="arrow" size={16} />
    </button>
    <div aria-live="polite">{err && <p className="msg msg-error">{err}</p>}{!err && bean?.lastError && <p className="msg msg-error">{bean.lastError}</p>}</div>
    <details className="customize">
      <summary><Icon name="portrait" size={17} /><span>A portrait to remember</span><span className="details-plus">+</span></summary>
      {custom && <img src={image!.url} alt={`Generated 2D portrait of ${petName}`} className="bean-thumb" />}
      <p className="bean-version" data-testid="bean-version">{custom ? 'Generated 2D portrait displayed beside your 3D pet.' : 'Create a 2D portrait to display beside your pet. Your 3D blueprint stays editable.'}</p>
      <button type="button" className="btn btn-ghost" data-testid="customize-bean" onClick={portrait} disabled={!imageOk || imgBusy || image?.status === 'loading'}>
        <Icon name="portrait" size={17} />{imgBusy || image?.status === 'loading' ? 'Drawing portrait…' : 'Generate portrait'}
      </button>
      <div aria-live="polite">
        {!imageOk && state && <p className="muted small">Portrait generation needs an OPENAI_API_KEY on the server.</p>}
        {(imgErr || image?.status === 'error') && <p className="msg msg-error">Couldn’t draw a portrait: {imgErr ?? image?.error}. Your 3D pet is still here.</p>}
      </div>
    </details>
  </Card>;
}
