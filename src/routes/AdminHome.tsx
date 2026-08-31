import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Database, Film, HardDrive, Image, Puzzle, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type HealthStatus, type Library } from '@/lib/api';
import { AdminShell } from './AdminShell';

/** Landing page for server administration: section cards plus service health. */
export function AdminHome() {
  const navigate = useNavigate();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [health, setHealth] = useState<HealthStatus>();

  const load = useCallback(async () => {
    try {
      const [{ libraries: nextLibraries }, nextHealth] = await Promise.all([api.libraries(), api.health()]);
      setLibraries(nextLibraries); setHealth(nextHealth);
    } catch { /* Cards remain useful as navigation even when status calls fail. */ }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return <AdminShell title="Administration" description="Manage this Dose server." wide>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <SectionCard icon={<Film />} title="Libraries" description={`${libraries.length} configured ${libraries.length === 1 ? 'library' : 'libraries'}`} action="Manage libraries" onClick={() => navigate('/admin/libraries')} />
      <SectionCard icon={<UsersRound />} title="Family accounts" description="Create accounts, roles, and passwords" action="Manage family" onClick={() => navigate('/admin/users')} />
      <SectionCard icon={<Clapperboard />} title="Media" description="Review, re-match, or remove titles" action="Manage media" onClick={() => navigate('/admin/media')} />
      <SectionCard icon={<Puzzle />} title="Plugins" description="Schedule and configure internal plugins" action="Manage plugins" onClick={() => navigate('/admin/plugins')} />
      <Card>
        <CardHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><HardDrive className="h-5 w-5" /></div>
          <CardTitle>Server status</CardTitle><CardDescription>Local service health</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow icon={<Database />} label="Database" ok={health?.database === 'ok'} />
          <StatusRow icon={<HardDrive />} label="Dose server" ok={health?.status === 'ok'} />
          <StatusRow icon={<Image />} label="TMDB metadata" ok={health?.metadata?.tmdb === 'configured'} unavailableLabel="Not configured" />
          <Button variant="outline" className="w-full" onClick={() => void load()}>Refresh status</Button>
        </CardContent>
      </Card>
    </div>
  </AdminShell>;
}

function SectionCard({ icon, title, description, action, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; onClick(): void }) {
  return <Card>
    <CardHeader>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent><Button className="w-full" onClick={onClick}>{action}</Button></CardContent>
  </Card>;
}

function StatusRow({ icon, label, ok, unavailableLabel = 'Unavailable' }: { icon: React.ReactNode; label: string; ok: boolean; unavailableLabel?: string }) {
  return <div className="flex items-center justify-between rounded-md border px-3 py-2">
    <span className="flex items-center gap-2 text-sm [&>svg]:h-4 [&>svg]:w-4">{icon}{label}</span>
    <span className={ok ? 'text-sm font-medium text-foreground' : 'text-sm font-medium text-destructive'}>{ok ? 'Healthy' : unavailableLabel}</span>
  </div>;
}
