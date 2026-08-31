import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageVariant, type CatalogCollectionView } from '@/lib/api';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Poster } from '@/components/media/Poster';
import { Button } from '@/components/ui/button';

export function CollectionPage() {
  const { id = '' } = useParams();
  const [collection, setCollection] = useState<CatalogCollectionView>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setCollection((await api.catalogCollection(id)).collection); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this collection.'); }
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar brandLabel="DOSE" brand="DOSE" brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error ? (
          <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">Collection unavailable</h1>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => void load()}>Try again</Button>
          </section>
        ) : !collection ? (
          <p role="status" className="py-20 text-center text-muted-foreground">Loading…</p>
        ) : (
          <>
            <header className="border-b pb-6">
              <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{collection.titles.length} {collection.titles.length === 1 ? 'title' : 'titles'} in your library</p>
            </header>
            {collection.titles.length === 0 && (collection.missing ?? []).length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">No titles from this collection are available yet.</p>
            ) : (
              <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {collection.titles.map((title) => (
                  <li key={title.id}>
                    <Poster
                      title={title.title}
                      src={imageVariant(title.posterUrl, { width: 384, height: 576, fit: 'cover', format: 'webp' })}
                      subtitle={title.year != null ? String(title.year) : undefined}
                      badge={title.badge}
                      interaction={{ href: `/media/${encodeURIComponent(title.id)}` }}
                    />
                  </li>
                ))}
                {(collection.missing ?? []).map((gap) => (
                  <li key={`missing-${gap.tmdbId}`} data-testid="collection-gap">
                    <Poster
                      title={gap.title}
                      src={imageVariant(gap.posterUrl, { width: 384, height: 576, fit: 'cover', format: 'webp' })}
                      subtitle={gap.year != null ? String(gap.year) : undefined}
                      badge="Not in library"
                      className="opacity-50 grayscale"
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-10 border-t pt-6"><Button asChild variant="outline"><Link to="/">Back to library</Link></Button></div>
          </>
        )}
      </main>
    </div>
  );
}
