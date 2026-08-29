import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, type Library, type LibraryScan } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';

interface LibraryManagerProps {
  open: boolean;
  libraries: Library[];
  onOpenChange: (open: boolean) => void;
  onChanged: (libraries: Library[]) => void;
  onError: (message: string) => void;
  error?: string;
  onScanCompleted?: () => void;
}

export function LibraryManager({ open, libraries, onOpenChange, onChanged, onError, error, onScanCompleted }: LibraryManagerProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Library>();
  const [scans, setScans] = useState<Record<string, LibraryScan | null>>({});
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [refreshResult, setRefreshResult] = useState<Record<string, string>>({});
  const polling = useRef(new Map<string, number>());
  const generation = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const generationState = generation;
    const pollingState = polling;
    const currentGeneration = ++generationState.current;
    pollingState.current.clear();
    if (!open) return () => { if (generationState.current === currentGeneration) ++generationState.current; };
    for (const library of libraries) {
      void api.latestLibraryScan(library.id).then(({ scan }) => {
        if (generation.current !== currentGeneration || !openRef.current) return;
        setScans((current) => ({ ...current, [library.id]: scan }));
        if (scan?.status === 'queued' || scan?.status === 'running') void pollScan(library.id, currentGeneration);
      }).catch(() => { /* Starting a new scan remains available if status lookup fails. */ });
    }
    return () => {
      if (generationState.current === currentGeneration) ++generationState.current;
      pollingState.current.clear();
    };
    // Library ids only change when the manager is refreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, libraries]);

  async function pollScan(libraryId: string, currentGeneration = generation.current) {
    if (!openRef.current || generation.current !== currentGeneration || polling.current.get(libraryId) === currentGeneration) return;
    polling.current.set(libraryId, currentGeneration);
    try {
      for (let attempt = 0; attempt < 120 && openRef.current && generation.current === currentGeneration; attempt += 1) {
        const { scan } = await api.latestLibraryScan(libraryId);
        if (!openRef.current || generation.current !== currentGeneration) return;
        setScans((current) => ({ ...current, [libraryId]: scan }));
        if (!scan || scan.status === 'completed' || scan.status === 'failed') {
          if (scan?.status === 'completed') onScanCompleted?.();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (caught) {
      if (openRef.current && generation.current === currentGeneration) onError(caught instanceof Error ? caught.message : 'Could not check scan status.');
    } finally { if (polling.current.get(libraryId) === currentGeneration) polling.current.delete(libraryId); }
  }

  async function startScan(libraryId: string) {
    const currentGeneration = generation.current;
    onError('');
    try {
      const { scan } = await api.startLibraryScan(libraryId);
      if (!openRef.current || generation.current !== currentGeneration) return;
      setScans((current) => ({ ...current, [libraryId]: scan }));
      void pollScan(libraryId, currentGeneration);
    } catch (caught) { if (openRef.current && generation.current === currentGeneration) onError(caught instanceof Error ? caught.message : 'Could not start scan.'); }
  }

  async function refreshMetadata(libraryId: string) {
    setRefreshing((current) => ({ ...current, [libraryId]: true }));
    setRefreshResult((current) => ({ ...current, [libraryId]: '' }));
    try {
      const result = await api.refreshLibraryMetadata(libraryId);
      setRefreshResult((current) => ({ ...current, [libraryId]: `Refreshed ${result.refreshed}${result.failed ? `, ${result.failed} failed` : ''}` }));
    } catch (caught) {
      setRefreshResult((current) => ({ ...current, [libraryId]: caught instanceof Error ? caught.message : 'Refresh failed' }));
    } finally {
      setRefreshing((current) => ({ ...current, [libraryId]: false }));
    }
  }

  async function refresh() {
    const result = await api.libraries();
    onChanged(result.libraries);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rootPath = String(data.get('rootPath') ?? '').trim();
    if (!rootPath) return;
    setBusy(true);
    onError('');
    try {
      await api.createLibrary({
        name: String(data.get('name') ?? '').trim(),
        kind: data.get('kind') === 'shows' ? 'shows' : 'movies',
        rootPath,
      });
      await refresh();
      form.reset();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Could not add library.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirming) return;
    setBusy(true);
    onError('');
    try {
      await api.deleteLibrary(confirming.id);
      await refresh();
      setConfirming(undefined);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'Could not delete library.');
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent aria-describedby="library-manager-description">
        <ModalHeader>
          <ModalTitle className="text-xl font-semibold">Manage libraries</ModalTitle>
          <ModalDescription id="library-manager-description">Add folders mounted into this Dose server.</ModalDescription>
        </ModalHeader>
        {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        <form className="space-y-4" onSubmit={create}>
          <Input name="name" label="Library name" placeholder="Movies" required disabled={busy} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Media type
            <select name="kind" className="h-10 rounded-md border border-input bg-background px-3" disabled={busy}>
              <option value="movies">Movies</option><option value="shows">Shows</option>
            </select>
          </label>
          <Input name="rootPath" label="Media path" placeholder="D:\\Media\\Movies or /media/movies" title="Use an absolute host path in native development or a mounted /media path in Docker" required disabled={busy} />
          <Button type="submit" disabled={busy}>Add library</Button>
        </form>
        <section className="mt-6 border-t pt-4" aria-labelledby="configured-libraries">
          <h2 id="configured-libraries" className="font-semibold">Configured libraries</h2>
          {libraries.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No libraries configured.</p> : (
            <ul className="mt-2 space-y-2">{libraries.map((library) => (
              <li key={library.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div><p className="font-medium">{library.name}</p><p className="text-xs text-muted-foreground">{library.rootPath ?? library.kind}</p>{scans[library.id] && <p role={scans[library.id]?.status === 'failed' ? 'alert' : 'status'} className="mt-1 text-xs text-muted-foreground">Scan {scans[library.id]?.status}{scans[library.id]?.processedFiles != null ? ` · ${scans[library.id]?.processedFiles}/${scans[library.id]?.discoveredFiles ?? '?'} files` : ''}{scans[library.id]?.error ? `: ${scans[library.id]?.error}` : ''}</p>}{refreshResult[library.id] && <p role="status" className="mt-1 text-xs text-muted-foreground">{refreshResult[library.id]}</p>}</div>
                <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void startScan(library.id)} disabled={busy || scans[library.id]?.status === 'queued' || scans[library.id]?.status === 'running'}>{scans[library.id]?.status === 'failed' ? 'Retry scan' : 'Scan'}</Button><Button type="button" variant="outline" size="sm" onClick={() => void refreshMetadata(library.id)} disabled={busy || refreshing[library.id]}>{refreshing[library.id] ? 'Refreshing…' : 'Refresh metadata'}</Button><Button type="button" variant="outline" size="sm" onClick={() => setConfirming(library)} disabled={busy}>Delete</Button></div>
              </li>
            ))}</ul>
          )}
        </section>
      </ModalContent>
      <Modal open={Boolean(confirming)} onOpenChange={(next) => { if (!next) setConfirming(undefined); }}>
        <ModalContent>
          <ModalHeader><ModalTitle className="text-xl font-semibold">Delete {confirming?.name}?</ModalTitle><ModalDescription>This removes the library from Dose. It does not delete media files.</ModalDescription></ModalHeader>
          <ModalFooter><Button type="button" variant="outline" onClick={() => setConfirming(undefined)}>Cancel</Button><Button type="button" variant="destructive" onClick={() => void remove()} disabled={busy}>Confirm delete</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </Modal>
  );
}
