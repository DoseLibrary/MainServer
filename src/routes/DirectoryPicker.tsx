import { useCallback, useEffect, useState } from 'react';
import { ArrowUp, Folder, HardDrive } from 'lucide-react';
import { api, type DirectoryListing } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';

interface DirectoryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the absolute path of the folder the admin settled on. */
  onPick: (path: string) => void;
  /** Where to start; omitted means the server's own root (/media, or the host's drives). */
  initialPath?: string;
}

/** A folder-only browser for choosing a library root, one level at a time. */
export function DirectoryPicker({ open, onOpenChange, onPick, initialPath }: DirectoryPickerProps) {
  const [listing, setListing] = useState<DirectoryListing>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (path?: string) => {
    setLoading(true); setError(undefined);
    try { setListing(await api.browseDirectories(path)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not read that folder.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) queueMicrotask(() => { void load(initialPath || undefined); }); }, [open, initialPath, load]);

  const atDriveList = listing?.path == null;
  // From a drive's root the parent is the drive list, reached by asking for nothing.
  const canGoUp = listing != null && !(atDriveList);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent aria-describedby="directory-picker-description" className="max-w-lg">
        <ModalHeader>
          <ModalTitle className="text-xl font-semibold">Choose a folder</ModalTitle>
          <ModalDescription id="directory-picker-description">Only folders are listed. Pick the one that holds this library's files.</ModalDescription>
        </ModalHeader>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load(listing?.parent ?? undefined)} disabled={!canGoUp || loading} aria-label="Up"><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
          <p className="min-w-0 flex-1 truncate font-mono text-sm" title={listing?.path ?? undefined}>{listing?.path ?? (listing ? 'Drives' : '')}</p>
        </div>
        {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        <ul className="max-h-[50vh] min-h-32 space-y-1 overflow-y-auto rounded-md border p-1">
          {loading && !listing && <li className="px-3 py-6 text-center text-sm text-muted-foreground" role="status">Reading…</li>}
          {listing && listing.entries.length === 0 && !error && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No subfolders</li>}
          {listing?.entries.map((entry) => (
            <li key={entry.path}>
              <button type="button" onClick={() => void load(entry.path)} disabled={loading} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                {atDriveList ? <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="truncate">{entry.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => { if (listing?.path) { onPick(listing.path); onOpenChange(false); } }} disabled={!listing?.path || loading}>Use this folder</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
