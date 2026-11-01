/** QR code + link that audience phones open to send orders. */
import { useEffect, useState } from 'react';
import type { PublicState } from '../../shared/types';
import { Card } from '../components/Card';
import { QrCode } from '../components/QrCode';
import { guestUrlFor } from '../lib/format';

export function AudienceCard({ state }: { state: PublicState | null }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const { url, isLocal } = guestUrlFor(state?.publicBaseUrl ?? null, origin);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    if (copied === 'idle') return;
    const t = setTimeout(() => setCopied('idle'), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  }

  return (
    <Card id="audience" title="Audience orders" className="audience-card">
      <p className="audience-lead">Scan to send an order from your phone.</p>
      <div className="qr-wrap">
        <QrCode value={url} size={196} testId="qr-code" />
      </div>
      <div className="url-row">
        <code className="guest-url" data-testid="guest-url">
          {url}
        </code>
        <button type="button" className="btn btn-secondary btn-small" onClick={copy} data-testid="copy-guest-url">
          {copied === 'ok' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy failed — select the link text instead' : ''}
      </p>
      {copied === 'fail' && <p className="msg msg-warn">Copy is blocked here — select the link text instead.</p>}
      {isLocal && (
        <p className="msg msg-coral" data-testid="localhost-warning">
          Phones can't open localhost. Set PUBLIC_BASE_URL to a reachable https URL or this computer's LAN address
          (see README). Presenter orders still work.
        </p>
      )}
    </Card>
  );
}
