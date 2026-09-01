import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ImagePlus, Layers, Trash2 } from 'lucide-react';
import { api, imageVariant, type UserCollectionView } from '@/lib/api';
import { Navbar } from '@/components/media/Navbar';
import { UserMenu } from '@/components/media/UserMenu';
import { Poster } from '@/components/media/Poster';
import { Button } from '@/components/ui/button';
import { useCatalogUpdates } from '@/lib/use-live';

/** Bigger than this and the base64 body is wasteful; the server re-encodes anyway. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/**
 * One collection the viewer built themselves, presented exactly like a library
 * collection — same header, same poster grid — with the owner's editing put
 * where the thing being edited is.
 */
export function UserCollectionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<UserCollectionView>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(undefined);
    try { setCollection((await api.userCollection(id)).collection); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this collection.'); }
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  // A title archived or removed elsewhere leaves this grid on the next push.
  useCatalogUpdates(() => { void load(); });

  const guard = async (run: () => Promise<void>) => {
    setBusy(true); setNotice(undefined);
    try { await run(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'That change could not be saved.'); }
    finally { setBusy(false); }
  };

  const rename = () => guard(async () => {
    if (!collection) return;
    const next = window.prompt('Collection name', collection.name)?.trim();
    if (!next || next === collection.name) return;
    await api.updateUserCollection(collection.id, { name: next });
    setCollection({ ...collection, name: next });
  });

  const upload = (file: File) => guard(async () => {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is too large. Pick one under 8 MB.');
    const { collection: updated } = await api.setUserCollectionImage(id, { dataUrl: await readAsDataUrl(file) });
    setCollection(updated); setNotice('Cover updated');
  });

  const coverFromItem = (mediaItemId: string) => guard(async () => {
    const { collection: updated } = await api.setUserCollectionImage(id, { mediaItemId });
    setCollection(updated); setNotice('Cover updated');
  });

  const clearCover = () => guard(async () => {
    setCollection((await api.clearUserCollectionImage(id)).collection);
  });

  const removeItem = (mediaItemId: string) => guard(async () => {
    setCollection((await api.removeFromUserCollection(id, mediaItemId)).collection);
  });

  const move = (index: number, delta: number) => guard(async () => {
    if (!collection) return;
    const order = collection.items.map((item) => item.id);
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    setCollection((await api.reorderUserCollection(id, order)).collection);
  });

  const destroy = () => guard(async () => {
    if (!collection || !window.confirm(`Delete ${collection.name}? The titles stay in your library.`)) return;
    await api.deleteUserCollection(id);
    navigate('/collections');
  });

  const count = collection?.items.length ?? 0;

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
            <header className="flex flex-wrap items-end gap-6 border-b pb-6">
              <div className="w-28 shrink-0 overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: '2 / 3' }}>
                {collection.imageUrl
                  ? <img src={imageVariant(collection.imageUrl, { width: 224, height: 336, fit: 'cover', format: 'webp' })} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Layers aria-hidden="true" className="h-8 w-8" /></div>}
              </div>
              <div className="min-w-0 grow">
                <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
                {collection.overview && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{collection.overview}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{count} {count === 1 ? 'title' : 'titles'} · only you can see this collection</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void rename()}>Rename</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                    <ImagePlus aria-hidden="true" className="h-4 w-4" />Upload cover
                  </Button>
                  {collection.imageUrl && <Button size="sm" variant="outline" disabled={busy} onClick={() => void clearCover()}>Remove cover</Button>}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void destroy()}>Delete collection</Button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    aria-label="Upload cover image"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void upload(file);
                    }}
                  />
                </div>
              </div>
            </header>

            {notice && <p role="status" className="mt-4 rounded-md border px-3 py-2 text-sm text-muted-foreground">{notice}</p>}

            {count === 0 ? (
              <p className="py-16 text-center text-muted-foreground">Nothing here yet. Add titles from any title's page.</p>
            ) : (
              <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {collection.items.map((item, index) => (
                  <li key={item.id}>
                    <Poster
                      title={item.title}
                      src={imageVariant(item.posterUrl, { width: 384, height: 576, fit: 'cover', format: 'webp' })}
                      subtitle={item.year != null ? String(item.year) : undefined}
                      badge={item.badge}
                      interaction={{ href: `/media/${encodeURIComponent(item.id)}` }}
                    />
                    <div className="mt-2 flex justify-between gap-1">
                      <span className="flex gap-1">
                        <Button size="sm" variant="outline" aria-label={`Move ${item.title} earlier`} disabled={busy || index === 0} onClick={() => void move(index, -1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" aria-label={`Move ${item.title} later`} disabled={busy || index === count - 1} onClick={() => void move(index, 1)}><ChevronRight className="h-4 w-4" /></Button>
                      </span>
                      <span className="flex gap-1">
                        <Button size="sm" variant="outline" aria-label={`Use ${item.title} as cover`} disabled={busy || !item.posterUrl} onClick={() => void coverFromItem(item.id)}><ImagePlus className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" aria-label={`Remove ${item.title}`} disabled={busy} onClick={() => void removeItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-10 flex gap-2 border-t pt-6">
              <Button asChild variant="outline"><Link to="/collections">All collections</Link></Button>
              <Button asChild variant="outline"><Link to="/">Back to library</Link></Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
