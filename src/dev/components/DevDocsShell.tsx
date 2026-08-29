import { useEffect, useState, type MouseEvent } from 'react';
import { Menu, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle, ModalTrigger } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/theme';

export interface DevDocsItem {
  key: string;
  label: string;
  group: string;
  content: React.ReactNode;
}

interface DevDocsShellProps { items: readonly DevDocsItem[] }

function getRequestedKey() { return new URLSearchParams(window.location.search).get('component'); }

function DocsNav({ items, activeKey, onSelect }: { items: readonly DevDocsItem[]; activeKey: string; onSelect: (key: string, event: MouseEvent<HTMLAnchorElement>) => void }) {
  const groups = [...new Set(items.map((item) => item.group))];
  return <nav aria-label="Component documentation">
    {groups.map((group) => <div key={group} className="mb-6">
      <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
      <ul className="space-y-1">{items.filter((item) => item.group === group).map((item) => <li key={item.key}>
        <a href={`?component=${encodeURIComponent(item.key)}`} aria-current={item.key === activeKey ? 'page' : undefined} onClick={(event) => onSelect(item.key, event)}
          className={cn('block rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', item.key === activeKey ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>
          {item.label}
        </a>
      </li>)}</ul>
    </div>)}
  </nav>;
}

export function DevDocsShell({ items }: DevDocsShellProps) {
  const fallbackKey = items[0]?.key ?? '';
  const resolveKey = () => items.some((item) => item.key === getRequestedKey()) ? getRequestedKey()! : fallbackKey;
  const [activeKey, setActiveKey] = useState(resolveKey);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleTheme = useThemeStore((state) => state.toggle);
  useEffect(() => { const sync = () => setActiveKey(resolveKey()); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync); });
  function selectItem(key: string, event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(window.location.href);
    url.searchParams.set('component', key);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setActiveKey(key);
    setMobileOpen(false);
  }
  const activeItem = items.find((item) => item.key === activeKey) ?? items[0];
  if (!activeItem) return null;

  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Modal open={mobileOpen} onOpenChange={setMobileOpen}>
          <ModalTrigger asChild><Button className="md:hidden" variant="outline" size="icon" aria-label="Open component menu" aria-expanded={mobileOpen}><Menu className="h-4 w-4" /></Button></ModalTrigger>
          <ModalContent className="left-0 top-0 h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none overflow-y-auto">
            <ModalHeader><ModalTitle>Components</ModalTitle><ModalDescription>Choose a component to view its examples.</ModalDescription></ModalHeader>
            <DocsNav items={items} activeKey={activeKey} onSelect={selectItem} />
          </ModalContent>
        </Modal>
        <a href="/dev" className="font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">DOSE UI</a>
        <span className="text-sm text-muted-foreground">Component docs</span>
        <Button className="ml-auto" variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme"><Moon className="h-4 w-4" /></Button>
      </div>
    </header>
    <div className="grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] overflow-y-auto border-r p-6 md:block"><DocsNav items={items} activeKey={activeKey} onSelect={selectItem} /></aside>
      <main className="min-w-0 px-4 py-10 sm:px-8 lg:px-12">{activeItem.content}</main>
    </div>
  </div>;
}
