/** Route by pathname: /join -> audience phone page, everything else -> VDraw. */
import { GuestPage } from './guest/GuestPage';
import { StudioPage } from './studio/StudioPage';

export function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.replace(/\/+$/, '') === '/join') return <GuestPage />;
  return <StudioPage />;
}
