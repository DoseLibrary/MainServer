import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, type UserCollectionSummary, type UserCollectionView } from '@/lib/api';

export function UserCollections() {
  const [collections, setCollections] = useState<UserCollectionSummary[]>();
  const [selected, setSelected] = useState<UserCollectionView>();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [searchParams] = useSearchParams();
  const openParam = searchParams.get('open');

  const load = useCallback(async () => {
    setError(undefined);
    try { setCollections((await api.userCollections()).collections); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your collections.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  // A ?open= link from the collections browse page lands with that collection expanded.
  useEffect(() => {
    if (!openParam) return;
    queueMicrotask(() => {
      void api.userCollection(openParam).then(({ collection }) => setSelected(collection)).catch(() => undefined);
    });
  }, [openParam]);

  const guard = async (run: () => Promise<void>) => {
    setError(undefined);
    try { await run(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'That change could not be saved.'); }
  };

  const open = (id: string) => guard(async () => { setSelected((await api.userCollection(id)).collection); });
  const create = () => guard(async () => {
    const trimmed = name.trim(); if (!trimmed) return;
    await api.createUserCollection({ name: trimmed });
    setName(''); await load();
  });
  const rename = (collection: UserCollectionSummary) => guard(async () => {
    const next = window.prompt('Collection name', collection.name)?.trim();
    if (!next || next === collection.name) return;
    await api.updateUserCollection(collection.id, { name: next });
    if (selected?.id === collection.id) setSelected({ ...selected, name: next });
    await load();
  });
  const remove = (collection: UserCollectionSummary) => guard(async () => {
    await api.deleteUserCollection(collection.id);
    if (selected?.id === collection.id) setSelected(undefined);
    await load();
  });
  const removeItem = (mediaItemId: string) => guard(async () => {
    if (!selected) return;
    setSelected((await api.removeFromUserCollection(selected.id, mediaItemId)).collection);
    await load();
  });
  const move = (index: number, delta: number) => guard(async () => {
    if (!selected) return;
    const order = selected.items.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    setSelected((await api.reorderUserCollection(selected.id, order)).collection);
  });

  return <div className="min-h-screen bg-background text-foreground">
    <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold">My Collections</h1><p className="mt-1 text-muted-foreground">Group titles however you like — only you can see these.</p></div>
        <Button asChild variant="outline"><Link to="/profile">Back</Link></Button>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      <form className="mb-8 flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <div className="grow"><Input label="New collection" value={name} onChange={(event) => setName(event.target.value)} placeholder="Saturday night picks" /></div>
        <Button type="submit" disabled={!name.trim()}>Create</Button>
      </form>

      {!collections ? <p role="status" className="py-12 text-center text-muted-foreground">Loading…</p>
        : collections.length === 0 ? <p className="py-12 text-center text-muted-foreground">You have no collections yet.</p>
          : <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {collections.map((collection) => (
              <li key={collection.id}>
                <Card>
                  <CardHeader><CardTitle>{collection.name}</CardTitle></CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{collection.itemCount} {collection.itemCount === 1 ? 'title' : 'titles'}</span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void open(collection.id)}>Open</Button>
                      <Button size="sm" variant="outline" onClick={() => void rename(collection)}>Rename</Button>
                      <Button size="sm" variant="outline" aria-label={`Delete ${collection.name}`} onClick={() => void remove(collection)}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>}

      {selected && <section aria-labelledby="collection-items-heading" className="mt-10 border-t pt-6">
        <h2 id="collection-items-heading" className="mb-4 text-xl font-semibold">{selected.name}</h2>
        {selected.items.length === 0 ? <p className="text-muted-foreground">No available titles in this collection yet.</p>
          : <ul className="flex list-none flex-col gap-2 p-0">
            {selected.items.map((item, index) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <Link to={`/media/${encodeURIComponent(item.id)}`} className="truncate hover:underline">{item.title}{item.year != null ? ` (${item.year})` : ''}</Link>
                <span className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => void move(index, -1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" aria-label={`Move ${item.title} down`} disabled={index === selected.items.length - 1} onClick={() => void move(index, 1)}><ChevronDown className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" aria-label={`Remove ${item.title}`} onClick={() => void removeItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                </span>
              </li>
            ))}
          </ul>}
      </section>}
    </main>
  </div>;
}
