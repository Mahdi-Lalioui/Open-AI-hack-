/** Ink-on-paper HTML tags pinned to 3D points (no fonts are fetched; uses the page font). */
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { CSSProperties, ReactNode } from 'react';
import { PALETTE } from '../theme';

export type TagTone = 'paper' | 'teal' | 'coral' | 'ink';

const TONES: Record<TagTone, { bg: string; fg: string; border: string }> = {
  paper: { bg: PALETTE.card, fg: PALETTE.ink, border: PALETTE.ink },
  teal: { bg: PALETTE.teal, fg: '#FFFFFF', border: PALETTE.tealDeep },
  coral: { bg: PALETTE.coral, fg: '#FFFFFF', border: '#B9533D' },
  ink: { bg: PALETTE.ink, fg: PALETTE.card, border: PALETTE.ink },
};

interface TagProps {
  position: [number, number, number];
  children: ReactNode;
  tone?: TagTone;
  tilt?: number;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  style?: CSSProperties;
  testId?: string;
}

export function Tag({ position, children, tone = 'paper', tilt = -2, size = 'md', selected, style, testId }: TagProps) {
  const narrow = useThree((s) => s.size.width < 560);
  const t = TONES[tone];
  const base = size === 'lg' ? 18 : size === 'sm' ? 12 : 15;
  const fontSize = narrow ? Math.max(11, base - 4) : base;
  return (
    <Html position={position} center zIndexRange={[30, 0]} pointerEvents="none" style={{ pointerEvents: 'none' }}>
      <div
        data-testid={testId}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize,
          lineHeight: 1.15,
          letterSpacing: '0.01em',
          color: t.fg,
          background: t.bg,
          border: `2px solid ${selected ? PALETTE.teal : t.border}`,
          boxShadow: selected
            ? `0 0 0 3px ${PALETTE.tealSoft}, 2px 3px 0 rgba(31,36,48,0.18)`
            : '2px 3px 0 rgba(31,36,48,0.16)',
          borderRadius: 6,
          padding: narrow ? '2px 7px' : '4px 10px',
          transform: `rotate(${tilt}deg)`,
          ...style,
        }}
      >
        {children}
      </div>
    </Html>
  );
}
