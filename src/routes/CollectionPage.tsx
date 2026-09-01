import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Download, Loader2 } from 'lucide-react';
import { api, imageVariant, type CatalogCollectionView, type SeerrMediaState } from '@/lib/api';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Poster } from '@/components/media/Poster';
import { Button } from '@/components/ui/button';
import { useCatalogUpdates } from '@/lib/use-live';

/** Seerr pushes nothing, so a page showing gaps asks again on this cadence. */
const REQUEST_POLL_MS = 30_000;

/** How a title Seerr already knows about is described on a gap tile. */
const REQUEST_LABELS: Partial<Record<SeerrMediaState, string>> = {
  pending: 'Requested',
  processing: 'Downloading',
  partial: 'Partly available',
  available: 'Ready soon',
};

export function CollectionPage() {
  const { id = '' } = useParams();
  const [collection, setCollection] = useState<CatalogCollectionView>();
  const [error, setError] = useState<string>();
  const [requestable, setRequestable] = useState(false);
  const [states, setStates] = useState<Record<number, SeerrMediaState>>({});
  const [pending, setPending] = useState<number>();
  const [requestError, setRequestError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setCollection((await api.catalogCollection(id)).collection); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this collection.'); }
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  // Request state is optional decoration: a Seerr that is absent, off, or down
  // simply leaves the gap tiles as they were.
  const refreshRequests = useCallback(async () => {
    try {
      const { configured, requests } = await api.requests();
      setRequestable(configured);
      setStates(Object.fromEntries(requests.map((entry) => [entry.tmdbId, entry.state])));
    } catch { setRequestable(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void refreshRequests(); }); }, [refreshRequests]);

  // A requested title that finished downloading arrives as a catalog push, and
  // moves from a gap tile to a real one.
  useCatalogUpdates(() => { void load(); void refreshRequests(); });

  // Everything before it lands — queued, downloading — is only visible in Seerr,
  // so poll for it while gaps are on screen and the tab is actually being looked at.
  const gapCount = (collection?.missing ?? []).length;
  useEffect(() => {
    if (!requestable || gapCount === 0) return;
    const tick = () => { if (document.visibilityState === 'visible') void refreshRequests(); };
    const timer = setInterval(tick, REQUEST_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [requestable, gapCount, refreshRequests]);

  const requestTitle = async (tmdbId: number) => {
    setPending(tmdbId); setRequestError(undefined);
    try {
      const { request } = await api.requestTitle(tmdbId);
      setStates((current) => ({ ...current, [tmdbId]: request.state }));
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'That request could not be sent.');
    } finally { setPending(undefined); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar brandLabel="DOSE" brand="DOSE" brandImage={{ src: '/logo.svg', alt: '' }} brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }, { id: 'collections', label: 'Collections', href: '/collections' }]} activeId="collections" actions={<UserMenu />} />
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
            {requestError && <p role="alert" className="mt-4 rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">{requestError}</p>}
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
                {(collection.missing ?? []).map((gap) => {
                  const tmdbId = Number(gap.tmdbId);
                  const state = states[tmdbId];
                  const label = state ? REQUEST_LABELS[state] : undefined;
                  return (
                    <li key={`missing-${gap.tmdbId}`} data-testid="collection-gap">
                      <Poster
                        title={gap.title}
                        src={imageVariant(gap.posterUrl, { width: 384, height: 576, fit: 'cover', format: 'webp' })}
                        subtitle={gap.year != null ? String(gap.year) : undefined}
                        badge="Not in library"
                        className="opacity-50 grayscale"
                      />
                      {requestable && Number.isInteger(tmdbId) && (label ? (
                        <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                          <Check aria-hidden="true" className="h-4 w-4" />{label}
                        </p>
                      ) : (
                        <Button
                          variant="outline"
                          className="mt-2 w-full"
                          disabled={pending === tmdbId}
                          onClick={() => void requestTitle(tmdbId)}
                        >
                          {pending === tmdbId
                            ? <><Loader2 aria-hidden="true" className="animate-spin" />Requesting…</>
                            : <><Download aria-hidden="true" />Request</>}
                        </Button>
                      ))}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-10 border-t pt-6"><Button asChild variant="outline"><Link to="/">Back to library</Link></Button></div>
          </>
        )}
      </main>
    </div>
  );
}
