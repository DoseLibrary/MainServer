import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { api, type CatalogCollectionSummary, type UserCollectionSummary } from '@/lib/api';
import { useCatalogUpdates } from '@/lib/use-live';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Button } from '@/components/ui/button';

/** One tile in either grid: poster when the collection has one, a glyph when not. */
function CollectionTile({ to, name, posterUrl, count }: { to: string; name: string; posterUrl?: string; count: number }) {
  return (
    <Link
      to={to}
      className="group flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
        {posterUrl
          ? <img src={posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Layers aria-hidden="true" className="h-10 w-10" /></div>}
      </div>
      <div className="flex flex-1 flex-col justify-between p-3">
        <span className="line-clamp-2 font-semibold tracking-tight">{name}</span>
        <span className="mt-1 text-sm text-muted-foreground">{count} {count === 1 ? 'title' : 'titles'}</span>
      </div>
    </Link>
  );
}

export function CollectionsPage() {
  const [providerCollections, setProviderCollections] = useState<CatalogCollectionSummary[]>();
  const [userCollections, setUserCollections] = useState<UserCollectionSummary[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [catalog, mine] = await Promise.all([api.catalogCollections(), api.userCollections()]);
      setProviderCollections(catalog.collections);
      setUserCollections(mine.collections);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load collections.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  // A collection that gains or loses a title elsewhere updates its count here.
  useCatalogUpdates(() => { void load(); });

  const loading = !error && (!providerCollections || !userCollections);
  const empty = providerCollections?.length === 0 && userCollections?.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }, { id: 'categories', label: 'Categories', href: '/categories' }, { id: 'collections', label: 'Collections', href: '/collections' }]} activeId="collections" actions={<UserMenu />} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="border-b pb-6">
          <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">Film series from your library, and the collections you have made yourself.</p>
        </header>
        {error ? (
          <section className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => void load()}>Try again</Button>
          </section>
        ) : loading ? (
          <p role="status" className="py-20 text-center text-muted-foreground">Loading…</p>
        ) : empty ? (
          <p className="py-16 text-center text-muted-foreground">No collections yet. Series like trilogies appear here after enrichment, and you can build your own from any title's page.</p>
        ) : (
          <>
            {userCollections && userCollections.length > 0 && (
              <section className="mt-8">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Your collections</h2>
                  <Link to="/profile/collections" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Manage</Link>
                </div>
                <ul className="mt-4 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {userCollections.map((collection) => (
                    <li key={collection.id}>
                      <CollectionTile to={`/my-collection/${encodeURIComponent(collection.id)}`} name={collection.name} posterUrl={collection.imageUrl} count={collection.itemCount} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {providerCollections && providerCollections.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-semibold tracking-tight">From your library</h2>
                <ul className="mt-4 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {providerCollections.map((collection) => (
                    <li key={collection.id}>
                      <CollectionTile to={`/collection/${encodeURIComponent(collection.id)}`} name={collection.name} posterUrl={collection.posterUrl} count={collection.count} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
