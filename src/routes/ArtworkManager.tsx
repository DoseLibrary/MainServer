import { useCallback, useEffect, useState } from 'react';
import { api, type ArtworkOptions } from '@/lib/api';
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal';

interface ArtworkManagerProps {
  open: boolean;
  itemId: string;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful change so the details page can refresh. */
  onApplied?: () => void;
}

export function ArtworkManager({ open, itemId, onOpenChange, onApplied }: ArtworkManagerProps) {
  const [options, setOptions] = useState<ArtworkOptions>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined); setOptions(undefined);
    try { setOptions(await api.artworkOptions(itemId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load artwork options.'); }
  }, [itemId]);
  useEffect(() => { if (open) queueMicrotask(() => { void load(); }); }, [open, load]);

  async function choose(change: { posterPath?: string; backdropPath?: string; logoPath?: string | null }, label: string) {
    setBusy(true); setNotice(undefined);
    try { await api.setArtwork(itemId, change); setNotice(label); onApplied?.(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Could not update artwork.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent aria-describedby="artwork-manager-description" className="max-w-3xl">
        <ModalHeader>
          <ModalTitle className="text-xl font-semibold">Change artwork</ModalTitle>
          <ModalDescription id="artwork-manager-description">Pick a poster, backdrop or title logo from the provider. The chosen image is cached locally.</ModalDescription>
        </ModalHeader>
        {error ? <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
          : !options ? <p role="status" className="py-8 text-center text-muted-foreground">Loading artwork…</p>
          : (options.posters.length === 0 && options.backdrops.length === 0 && options.logos.length === 0) ? <p className="py-8 text-center text-muted-foreground">No provider artwork is available for this title.</p>
          : (
            <div className="max-h-[70vh] space-y-6 overflow-y-auto">
              {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
              {options.posters.length > 0 && (
                <section aria-labelledby="artwork-posters">
                  <h3 id="artwork-posters" className="mb-2 font-semibold">Posters</h3>
                  <ul className="grid list-none grid-cols-3 gap-3 p-0 sm:grid-cols-4 md:grid-cols-6">
                    {options.posters.map((option) => (
                      <li key={option.path}>
                        <button type="button" disabled={busy} onClick={() => void choose({ posterPath: option.path }, 'Poster updated')} className="block w-full overflow-hidden rounded-md ring-1 ring-border transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                          <img src={option.previewUrl} alt="Poster option" loading="lazy" className="aspect-[2/3] w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {options.logos.length > 0 && (
                <section aria-labelledby="artwork-logos">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 id="artwork-logos" className="font-semibold">Logos</h3>
                    <button type="button" disabled={busy} onClick={() => void choose({ logoPath: null }, 'Logo removed')} className="text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline disabled:opacity-50">Remove logo</button>
                  </div>
                  <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                    {options.logos.map((option) => (
                      <li key={option.path}>
                        <button type="button" disabled={busy} onClick={() => void choose({ logoPath: option.path }, 'Logo updated')} className="block w-full overflow-hidden rounded-md bg-neutral-900 p-3 ring-1 ring-border transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                          <img src={option.previewUrl} alt="Logo option" loading="lazy" className="aspect-video w-full object-contain" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {options.backdrops.length > 0 && (
                <section aria-labelledby="artwork-backdrops">
                  <h3 id="artwork-backdrops" className="mb-2 font-semibold">Backdrops</h3>
                  <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                    {options.backdrops.map((option) => (
                      <li key={option.path}>
                        <button type="button" disabled={busy} onClick={() => void choose({ backdropPath: option.path }, 'Backdrop updated')} className="block w-full overflow-hidden rounded-md ring-1 ring-border transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                          <img src={option.previewUrl} alt="Backdrop option" loading="lazy" className="aspect-video w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
      </ModalContent>
    </Modal>
  );
}
