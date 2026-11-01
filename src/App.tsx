/** Route by pathname: / -> landing page, /join -> audience phones, everything else -> the app. */
import { GuestPage } from './guest/GuestPage';
import { LandingPage } from './landing/LandingPage';
import { StudioPage } from './studio/StudioPage';

export function App() {
  const path = (typeof window !== 'undefined' ? window.location.pathname : '/').replace(/\/+$/, '');
  if (path === '') return <LandingPage />;
  if (path === '/join') return <GuestPage />;
  return <StudioPage />;
}
