/** A real phone join link and scannable QR for the shared living creation. */
import { useEffect, useState } from 'react';
import type { PublicState } from '../../shared/types';
import { Card } from '../components/Card';
import { QrCode } from '../components/QrCode';
import { Icon } from '../components/Icon';
import { guestUrlFor } from '../lib/format';

export function AudienceCard({ state }: { state: PublicState | null }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const { url, isLocal } = guestUrlFor(state?.publicBaseUrl ?? null, origin);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    if (copied === 'idle') return;
    const timer = setTimeout(() => setCopied('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied('ok'); }
    catch { setCopied('fail'); }
  }

  return <Card id="audience" title="Let people join" className="audience-card" aside={<Icon name="people" size={19} />}>
    <p className="audience-lead">Anyone in the room can scan this and try the design from their phone.</p>
    <div className="qr-wrap"><QrCode value={url} size={164} testId="qr-code" /></div>
    <p className="qr-instruction">Everyone sees the same thing as it happens.</p>
    <div className="url-row"><code className="guest-url" data-testid="guest-url">{url}</code><button type="button" className="btn btn-secondary btn-icon-only" onClick={copy} data-testid="copy-guest-url" aria-label={copied === 'ok' ? 'Link copied' : 'Copy audience link'} title="Copy audience link"><Icon name={copied === 'ok' ? 'check' : 'copy'} size={17} /></button></div>
    <p className="visually-hidden" aria-live="polite">{copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copying failed, so select the link text instead' : ''}</p>
    {copied === 'fail' && <p className="msg msg-warn">This browser blocked copying, so select the link text instead.</p>}
    {isLocal && <p className="local-link-note" data-testid="localhost-warning">Phones can’t open localhost. Set <code>PUBLIC_BASE_URL</code> to a reachable address. <a href="/join" target="_blank" rel="noreferrer">Open the guest view here <Icon name="arrow" size={12} /></a></p>}
  </Card>;
}
