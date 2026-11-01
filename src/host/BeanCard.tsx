/** Bean the pet: mood, latest decision (AI or example), Ask Bean, AI management, manual Add worker. */
import { useState } from 'react';
import type { PublicState } from '../../shared/types';
import { MAX_WORKERS } from '../../shared/types';
import { Card } from '../components/Card';
import { api } from '../lib/api';
import { beanActionWords, beanSourceLabel, formatClock } from '../lib/format';
import { getBeanMood } from './mood';

export function BeanCard({ state }: { state: PublicState | null }) {
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [mgmtBusy, setMgmtBusy] = useState(false);
  const [mgmtError, setMgmtError] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  const bean = state?.bean;
  const sim = state?.sim;
  const decision = bean?.lastDecision ?? null;
  const thinking = Boolean(bean?.thinking) || asking;
  const workers = sim?.workers.length ?? 0;
  const atCap = workers >= MAX_WORKERS;
  const imageApi = state?.api.image;
  const imageConfigured = Boolean(imageApi && imageApi.state !== 'not_configured');
  const image = bean?.image;
  const customInUse = image?.status === 'ready' && Boolean(image.url);
  const mood = state ? getBeanMood(state) : null;
  const stale = Boolean(decision && sim && decision.epoch !== sim.epoch);

  async function ask() {
    setAskError(null);
    setAsking(true);
    try {
      await api.askBean();
    } catch (err) {
      setAskError((err as Error).message);
    } finally {
      setAsking(false);
    }
  }

  async function addWorker() {
    setWorkerError(null);
    setWorkerBusy(true);
    try {
      await api.addWorker();
    } catch (err) {
      setWorkerError((err as Error).message);
    } finally {
      setWorkerBusy(false);
    }
  }

  async function toggleManagement(enabled: boolean) {
    setMgmtError(null);
    setMgmtBusy(true);
    try {
      await api.setAiManagement(enabled);
    } catch (err) {
      setMgmtError((err as Error).message);
    } finally {
      setMgmtBusy(false);
    }
  }

  async function customize() {
    setImgError(null);
    setImgBusy(true);
    try {
      await api.generateBeanImage();
    } catch (err) {
      setImgError((err as Error).message);
    } finally {
      setImgBusy(false);
    }
  }

  return (
    <Card id="bean" title="Bean" className="bean-card" aside={<span className={`mood mood-${mood?.mood ?? 'sleepy'}`}>{mood?.mood ?? '…'}</span>}>
      <p className="bean-line" data-testid="bean-mood">
        {mood ? `“${mood.line}”` : 'Bean is waking up…'}
      </p>

      <div
        className={`decision ${decision ? `decision-${decision.action}` : 'decision-none'} ${stale ? 'is-stale' : ''}`}
        data-testid="bean-action"
        data-action={decision?.action ?? ''}
        data-source={decision?.source ?? ''}
      >
        {decision ? (
          <>
            <div className="decision-head">
              <strong className="decision-action">{beanActionWords(decision.action)}</strong>
              <span className={`source-badge source-${decision.source}`}>{beanSourceLabel(decision)}</span>
            </div>
            <p className="decision-why">{decision.explanation}</p>
            <p className="decision-applied">
              {decision.applied
                ? 'Applied — a backup worker joined.'
                : `Not applied${decision.notAppliedReason ? `: ${decision.notAppliedReason}` : '.'}`}
              <span className="muted"> · at sim {formatClock(decision.simTime)}</span>
            </p>
            {stale && <p className="stale-note">From before the last reset — it does not describe this run.</p>}
          </>
        ) : (
          <p className="muted">Bean hasn’t been asked yet.</p>
        )}
      </div>

      <div className="button-row">
        <button
          type="button"
          className="btn btn-primary"
          data-testid="ask-bean"
          onClick={ask}
          disabled={!state || thinking}
          aria-busy={thinking || undefined}
        >
          {thinking ? 'Bean is thinking…' : 'Ask Bean'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="add-worker"
          onClick={addWorker}
          disabled={!state || atCap || workerBusy}
        >
          {atCap ? `${MAX_WORKERS} / ${MAX_WORKERS} workers` : 'Add worker'}
        </button>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          data-testid="ai-management"
          checked={Boolean(bean?.aiManagement)}
          disabled={!state || mgmtBusy}
          onChange={(e) => toggleManagement(e.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
        <span>
          Let Bean manage staffing (AI management)
          <span className="toggle-hint">When on, a real AI “Call backup” decision adds the worker. Add worker always works by hand.</span>
        </span>
      </label>

      <div className="bean-errors" aria-live="polite">
        {askError && <p className="msg msg-error">Ask Bean failed: {askError}</p>}
        {!askError && bean?.lastError && <p className="msg msg-error">Bean: {bean.lastError}</p>}
        {workerError && <p className="msg msg-error">{workerError}</p>}
        {mgmtError && <p className="msg msg-error">{mgmtError}</p>}
      </div>

      <div className="customize">
        <div className="customize-head">
          {customInUse && image?.url ? <img src={image.url} alt="Custom Bean picture" className="bean-thumb" /> : null}
          <p className="bean-version" data-testid="bean-version">
            In use: {customInUse ? 'Custom Bean — 2D picture from image generation on a 3D stand' : 'Default 3D Bean'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          data-testid="customize-bean"
          onClick={customize}
          disabled={!imageConfigured || imgBusy || image?.status === 'loading'}
        >
          {imgBusy || image?.status === 'loading' ? 'Drawing Bean…' : 'Customize Bean'}
        </button>
        <div aria-live="polite">
          {!imageConfigured && state && <p className="muted small">Needs an OPENAI_API_KEY on the server.</p>}
          {(imgError || image?.status === 'error') && (
            <p className="msg msg-error">Couldn’t draw Bean: {imgError ?? image?.error ?? 'unknown error'}. The default Bean stays.</p>
          )}
          {image?.status === 'ready' && !imgError && (
            <p className="msg msg-ok">Custom Bean ready{image.model ? ` · ${image.model}` : ''}.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
