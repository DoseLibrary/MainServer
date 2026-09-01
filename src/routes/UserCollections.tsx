import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Layers, Trash2 } from 'lucide-react';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, imageVariant, type UserCollectionSummary } from '@/lib/api';
import { useCatalogUpdates } from '@/lib/use-live';

/**
 * The list of collections the viewer has made, and where new ones are created.
 * Everything about one collection — its titles, its order, its cover — is edited
 * on the collection's own page.
 */
export function UserCollections() {
  const [collections, setCollections] = useState<UserCollectionSummary[]>();
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
  useCatalogUpdates(() => { void load(); });

  const guard = async (run: () => Promise<void>) => {
    setError(undefined);
    try { await run(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'That change could not be saved.'); }
  };

  const create = () => guard(async () => {
    const trimmed = name.trim(); if (!trimmed) return;
    await api.createUserCollection({ name: trimmed });
    setName(''); await load();
  });
  const remove = (collection: UserCollectionSummary) => guard(async () => {
    await api.deleteUserCollection(collection.id);
    await load();
  });

  // Links from before collections had their own page still work.
  if (openParam) return <Navigate to={`/my-collection/${encodeURIComponent(openParam)}`} replace />;

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
                  <CardHeader className="flex-row items-center gap-3 space-y-0">
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded border bg-muted">
                      {collection.imageUrl
                        ? <img src={imageVariant(collection.imageUrl, { width: 88, height: 132, fit: 'cover', format: 'webp' })} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Layers aria-hidden="true" className="h-5 w-5" /></div>}
                    </div>
                    <CardTitle><Link to={`/my-collection/${encodeURIComponent(collection.id)}`} className="hover:underline">{collection.name}</Link></CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{collection.itemCount} {collection.itemCount === 1 ? 'title' : 'titles'}</span>
                    <span className="flex gap-2">
                      <Button asChild size="sm" variant="outline"><Link to={`/my-collection/${encodeURIComponent(collection.id)}`}>Open</Link></Button>
                      <Button size="sm" variant="outline" aria-label={`Delete ${collection.name}`} onClick={() => void remove(collection)}><Trash2 className="h-4 w-4" /></Button>
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>}
    </main>
  </div>;
}
