import { Link } from 'react-router-dom';
import { Navbar } from '@/components/media/Navbar';
import { Button } from '@/components/ui/button';
import { PluginManager } from './PluginManager';

export function PluginsPage() {
  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandHref="/" items={[{ id: 'profile', label: 'Profile', href: '/profile' }]} />
    <main className="mx-auto min-h-0 w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">Plugins</h1><p className="mt-1 text-muted-foreground">Configure, schedule, and run installed plugins.</p></div><Button asChild variant="outline"><Link to="/profile">Back</Link></Button></div>
      <PluginManager embedded />
    </main>
  </div>;
}
