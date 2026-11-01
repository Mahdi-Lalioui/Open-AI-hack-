import type { CSSProperties, ReactNode } from 'react';

export type IconName = 'paper' | 'spark' | 'pencil' | 'cube' | 'heart' | 'food' | 'play' | 'present' | 'close' | 'reset' | 'plus' | 'minus' | 'rotateLeft' | 'rotateRight' | 'arrow' | 'people' | 'copy' | 'check' | 'portrait' | 'switch' | 'bolt';

const paths: Record<IconName, ReactNode> = {
  paper: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h4M9 12h7M9 16h5" /></>,
  spark: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4zM20 3v4M18 5h4" /></>,
  pencil: <><path d="m4 16 11-11a2.1 2.1 0 0 1 3 3L7 19l-4 1zM13 7l4 4M4 16l3 3" /></>,
  cube: <><path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5" /></>,
  heart: <path d="M20.7 5.8a5.1 5.1 0 0 0-7.2 0L12 7.3l-1.5-1.5a5.1 5.1 0 0 0-7.2 7.2L12 21l8.7-8a5.1 5.1 0 0 0 0-7.2Z" />,
  food: <><path d="M3 13h18a9 9 0 0 1-18 0ZM7 19v2h10v-2M8 3c-2 2 2 3 0 5M13 3c-2 2 2 3 0 5M18 3c-2 2 2 3 0 5" /></>,
  play: <><path d="m8 5 12 7-12 7z" /><path d="M3 6v12" /></>,
  present: <><path d="M3 4h18v12H3zM12 16v5M8 21h8M8 8l4 3 4-3" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  rotateLeft: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /><path d="m11 9 4 3-4 3" /></>,
  rotateRight: <><path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6" /><path d="m13 9-4 3 4 3" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9" /><circle cx="9" cy="7" r="4" /><path d="M17 3.1a4 4 0 0 1 0 7.8" /></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
  check: <path d="m5 12 4 4L20 5" />,
  portrait: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="12" cy="10" r="3" /><path d="M6 21v-2a6 6 0 0 1 12 0v2" /></>,
  switch: <><rect x="2" y="6" width="20" height="12" rx="6" /><circle cx="8" cy="12" r="3" /></>,
  bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8z" />,
};

export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
