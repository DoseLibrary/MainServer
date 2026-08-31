import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';
import { api, type QueueItem } from '@/lib/api';

export function Queue() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setItems((await api.queue()).items); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your queue.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const guard = async (run: () => Promise<void>) => {
    setError(undefined);
    try { await run(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'That change could not be saved.'); }
  };
  const remove = (mediaItemId: string) => guard(async () => { setItems((await api.removeFromQueue(mediaItemId)).items); });
  const clear = () => guard(async () => { setItems((await api.clearQueue()).items); });
  const move = (index: number, delta: number) => guard(async () => {
    if (!items) return;
    const order = items.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    setItems((await api.reorderQueue(order)).items);
  });
  const startMarathon = () => {
    const first = items?.find((item) => !item.unavailable);
    if (first) navigate(`/watch/${encodeURIComponent(first.id)}?queue=1`);
  };
  const playable = (items ?? []).some((item) => !item.unavailable);

  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Marathon queue</h1><p className="mt-1 text-muted-foreground">Line titles up and play straight through.</p></div>
        <div className="flex gap-2">
          <Button onClick={startMarathon} disabled={!playable}>Start marathon</Button>
          <Button asChild variant="outline"><Link to="/profile">Back</Link></Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {!items ? <p role="status" className="py-12 text-center text-muted-foreground">Loading…</p>
        : items.length === 0 ? <p className="py-12 text-center text-muted-foreground">Your queue is empty. Add titles from any media page.</p>
          : <>
            <ul className="flex list-none flex-col gap-2 p-0">
              {items.map((item, index) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link to={`/media/${encodeURIComponent(item.id)}`} className="truncate hover:underline">{item.title}{item.year != null ? ` (${item.year})` : ''}</Link>
                    {item.unavailable && <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Unavailable</span>}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => void move(index, -1)}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" aria-label={`Move ${item.title} down`} disabled={index === items.length - 1} onClick={() => void move(index, 1)}><ChevronDown className="h-4 w-4" /></Button>
                    <Button size="sm" variant="outline" aria-label={`Remove ${item.title}`} onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6"><Button variant="outline" onClick={() => void clear()}>Clear queue</Button></div>
          </>}
    </main>
  </div>;
}
