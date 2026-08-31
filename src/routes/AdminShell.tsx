import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/libraries', label: 'Libraries' },
  { to: '/admin/users', label: 'Family' },
  { to: '/admin/media', label: 'Media' },
  { to: '/admin/plugins', label: 'Plugins' },
];

/** Shared frame for /admin pages: navbar, section tabs, page heading. */
export function AdminShell({ title, description, wide = false, children }: { title: string; description?: string; wide?: boolean; children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <nav aria-label="Administration sections" className="border-b bg-muted/30">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} end={section.end}
            className={({ isActive }) => cn(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}>
            {section.label}
          </NavLink>
        ))}
      </div>
    </nav>
    <main className={cn('mx-auto min-h-0 w-full px-4 py-8 sm:px-6 lg:px-8', wide ? 'max-w-6xl' : 'max-w-4xl')}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </main>
  </div>;
}
