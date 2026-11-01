/** Route by pathname: /join → guest phone page, everything else → host. OWNER: lead. */
import { HostPage } from './host/HostPage';
import { GuestPage } from './guest/GuestPage';

export function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.replace(/\/+$/, '') === '/join') return <GuestPage />;
  return <HostPage />;
}
