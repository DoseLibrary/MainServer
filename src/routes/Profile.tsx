import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clapperboard, Database, Film, HardDrive, Image, Puzzle, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Navbar } from '@/components/media/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type HealthStatus, type Library, type User } from '@/lib/api';
import { FamilyManager } from './FamilyManager';
import { LibraryManager } from './LibraryManager';
import { MediaAdmin } from './MediaAdmin';

export function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User>();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [health, setHealth] = useState<HealthStatus>();
  const [error, setError] = useState<string>();
  const [familyOpen, setFamilyOpen] = useState(false);
  const [librariesOpen, setLibrariesOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [managerError, setManagerError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [{ user: nextUser }, { libraries: nextLibraries }, nextHealth] = await Promise.all([api.me(), api.libraries(), api.health()]);
      setUser(nextUser); setLibraries(nextLibraries); setHealth(nextHealth);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this profile.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function logout() { try { await api.logout(); } finally { navigate('/'); } }
  const isAdmin = user?.role === 'admin';
  const initials = user?.username.slice(0, 2).toUpperCase() ?? 'DO';
  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<Button variant="outline" size="sm" onClick={() => void logout()}>Sign out</Button>} />
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {error ? <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"><h1 className="text-2xl font-bold">Profile unavailable</h1><p className="text-muted-foreground">{error}</p><Button onClick={() => void load()}>Try again</Button></section> : !user ? <p role="status" className="py-20 text-center text-muted-foreground">Loading profile…</p> : <>
        <section className="flex flex-col gap-6 border-b pb-8 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border bg-muted text-3xl font-bold">{initials}</div>
          <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><h1 className="truncate text-3xl font-bold tracking-tight">{user.username}</h1>{isAdmin && <span className="rounded-full border border-foreground/20 bg-foreground/5 px-2.5 py-1 text-xs font-semibold">Administrator</span>}</div><p className="text-muted-foreground">Your local Dose account and server controls.</p></div>
        </section>

        <section aria-labelledby="account-heading" className="py-8"><h2 id="account-heading" className="mb-4 text-xl font-semibold">Account</h2><div className="grid gap-4 md:grid-cols-2">
          <SummaryCard icon={<UserRound />} title="Profile" description="Local account" value={user.username} detail={isAdmin ? 'Full administrator access' : 'Member access'} />
          <SummaryCard icon={<ShieldCheck />} title="Privacy" description="Offline-first" value="Stored locally" detail="Your account and watch activity stay on this server." />
        </div></section>

        {isAdmin && <section aria-labelledby="admin-heading" className="border-t py-8"><div className="mb-4"><h2 id="admin-heading" className="text-xl font-semibold">Administration</h2><p className="mt-1 text-sm text-muted-foreground">Manage this Dose server without leaving your profile.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AdminCard icon={<Film />} title="Libraries" description={`${libraries.length} configured ${libraries.length === 1 ? 'library' : 'libraries'}`} action="Manage libraries" onClick={() => { setManagerError(undefined); setLibrariesOpen(true); }} />
          <AdminCard icon={<UsersRound />} title="Family accounts" description="Create accounts, roles, and passwords" action="Manage family" onClick={() => setFamilyOpen(true)} />
          <AdminCard icon={<Puzzle />} title="Plugins" description="Schedule and configure internal plugins" action="Manage plugins" onClick={() => navigate('/profile/plugins')} />
          <AdminCard icon={<Clapperboard />} title="Media" description="Review, re-match, or remove titles" action="Manage media" onClick={() => setMediaOpen(true)} />
          <Card><CardHeader><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><HardDrive className="h-5 w-5" /></div><CardTitle>Server status</CardTitle><CardDescription>Local service health</CardDescription></CardHeader><CardContent className="space-y-3"><StatusRow icon={<Database />} label="Database" ok={health?.database === 'ok'} /><StatusRow icon={<HardDrive />} label="Dose server" ok={health?.status === 'ok'} /><StatusRow icon={<Image />} label="TMDB metadata" ok={health?.metadata?.tmdb === 'configured'} unavailableLabel="Not configured" /><Button variant="outline" className="w-full" onClick={() => void load()}>Refresh status</Button></CardContent></Card>
        </div></section>}

        <div className="border-t pt-8"><Button asChild variant="outline"><Link to="/">Back to library</Link></Button></div>
      </>}
    </main>
    {user && isAdmin && <><LibraryManager open={librariesOpen} libraries={libraries} onOpenChange={setLibrariesOpen} error={managerError} onError={setManagerError} onChanged={setLibraries} /><FamilyManager open={familyOpen} actorId={user.id} onOpenChange={setFamilyOpen} /><MediaAdmin open={mediaOpen} onOpenChange={setMediaOpen} /></>}
  </div>;
}

function SummaryCard({ icon, title, description, value, detail }: { icon: React.ReactNode; title: string; description: string; value: string; detail: string }) {
  return <Card><CardHeader className="flex-row items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div><div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></div></CardHeader><CardContent><p className="font-medium">{value}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></CardContent></Card>;
}
function AdminCard({ icon, title, description, action, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; onClick(): void }) {
  return <Card><CardHeader><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted [&>svg]:h-5 [&>svg]:w-5">{icon}</div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={onClick}>{action}</Button></CardContent></Card>;
}
function StatusRow({ icon, label, ok, unavailableLabel = 'Unavailable' }: { icon: React.ReactNode; label: string; ok: boolean; unavailableLabel?: string }) {
  return <div className="flex items-center justify-between rounded-md border px-3 py-2"><span className="flex items-center gap-2 text-sm [&>svg]:h-4 [&>svg]:w-4">{icon}{label}</span><span className={ok ? 'text-sm font-medium text-foreground' : 'text-sm font-medium text-destructive'}>{ok ? 'Healthy' : unavailableLabel}</span></div>;
}
