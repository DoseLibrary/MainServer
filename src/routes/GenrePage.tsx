import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, imageVariant, type CatalogGenreView } from '@/lib/api';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Poster } from '@/components/media/Poster';
import { Button } from '@/components/ui/button';

export function GenrePage() {
  const { id = '' } = useParams();
  const [genre, setGenre] = useState<CatalogGenreView>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setGenre((await api.catalogGenre(id)).genre); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this genre.'); }
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }]} actions={<UserMenu />} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error ? (
          <section className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">Genre unavailable</h1>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => void load()}>Try again</Button>
          </section>
        ) : !genre ? (
          <p role="status" className="py-20 text-center text-muted-foreground">Loading…</p>
        ) : (
          <>
            <header className="border-b pb-6">
              <h1 className="text-3xl font-bold tracking-tight">{genre.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{genre.titles.length} {genre.titles.length === 1 ? 'title' : 'titles'}</p>
            </header>
            {genre.titles.length === 0 ? (
              <p className="py-16 text-center text-muted-foreground">No titles in this genre are available yet.</p>
            ) : (
              <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {genre.titles.map((title) => (
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
              </ul>
            )}
            <div className="mt-10 border-t pt-6"><Button asChild variant="outline"><Link to="/">Back to library</Link></Button></div>
          </>
        )}
      </main>
    </div>
  );
}
