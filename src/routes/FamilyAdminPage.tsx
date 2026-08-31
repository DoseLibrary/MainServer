import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AdminShell } from './AdminShell';
import { FamilyManager } from './FamilyManager';

export function FamilyAdminPage() {
  const [actorId, setActorId] = useState<string>();

  useEffect(() => {
    let active = true;
    void api.me().then(({ user }) => { if (active) setActorId(user.id); }).catch(() => { /* AdminRoute already redirected unauthenticated visitors. */ });
    return () => { active = false; };
  }, []);

  return <AdminShell title="Family accounts" description="Create accounts and control access to this Dose library.">
    {actorId ? <FamilyManager open embedded actorId={actorId} />
      : <p role="status" className="py-8 text-center text-muted-foreground">Loading accounts…</p>}
  </AdminShell>;
}
