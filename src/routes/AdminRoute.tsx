import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '@/lib/api';

/** Client-side gate for /admin routes. The server enforces the real check; this
 * only keeps members out of a page that would answer 403 to every request. */
export function AdminRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'admin' | 'denied'>('loading');

  useEffect(() => {
    let active = true;
    void api.me()
      .then(({ user }) => { if (active) setState(user.role === 'admin' ? 'admin' : 'denied'); })
      .catch(() => { if (active) setState('denied'); });
    return () => { active = false; };
  }, []);

  if (state === 'loading') return <p role="status" className="py-20 text-center text-muted-foreground">Checking access…</p>;
  if (state === 'denied') return <Navigate to="/profile" replace />;
  return <>{children}</>;
}
