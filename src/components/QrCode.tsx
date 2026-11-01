import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PALETTE } from '../theme';

interface QrCodeProps {
  value: string;
  size?: number;
  testId?: string;
}

/** High-contrast QR code (ink on paper), rendered client-side as an <img> data URL. */
export function QrCode({ value, size = 220, testId }: QrCodeProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: size * 2,
      color: { dark: PALETTE.ink, light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <p className="qr-failed" data-testid={testId}>
        Could not draw the QR code. Share the link below instead.
      </p>
    );
  }
  return (
    <div className="qr-frame" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} width={size} height={size} alt={`QR code that opens ${value}`} data-testid={testId} />
      ) : (
        <div className="qr-placeholder" aria-hidden="true" />
      )}
    </div>
  );
}
