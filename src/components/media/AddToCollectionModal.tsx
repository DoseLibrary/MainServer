import { useCallback, useEffect, useState } from 'react';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type UserCollectionSummary } from '@/lib/api';

export interface AddToCollectionModalProps {
  open: boolean;
  mediaItemId: string;
  onOpenChange(open: boolean): void;
}

/** Adds one title to an existing personal collection, or to a new one created inline. */
export function AddToCollectionModal({ open, mediaItemId, onOpenChange }: AddToCollectionModalProps) {
  const [collections, setCollections] = useState<UserCollectionSummary[]>();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setCollections((await api.userCollections()).collections); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your collections.'); }
  }, []);
  useEffect(() => { if (!open) return; queueMicrotask(() => { setStatus(undefined); setName(''); void load(); }); }, [open, load]);

  async function add(collection: UserCollectionSummary) {
    setError(undefined);
    try { await api.addToUserCollection(collection.id, mediaItemId); setStatus(`Added to ${collection.name}.`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add this title.'); }
  }
  async function createAndAdd() {
    const trimmed = name.trim(); if (!trimmed) return;
    setError(undefined);
    try {
      const { collection } = await api.createUserCollection({ name: trimmed });
      await api.addToUserCollection(collection.id, mediaItemId);
      setName(''); setStatus(`Added to ${collection.name}.`); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create that collection.'); }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent aria-label="Add to collection">
        <ModalHeader>
          <ModalTitle className="text-lg font-semibold">Add to collection</ModalTitle>
          <ModalDescription className="text-sm text-muted-foreground">Pick one of your collections, or start a new one.</ModalDescription>
        </ModalHeader>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        {status && <p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p>}
        {!collections ? <p role="status" className="text-sm text-muted-foreground">Loading…</p>
          : collections.length === 0 ? <p className="text-sm text-muted-foreground">You have no collections yet.</p>
            : <ul className="flex max-h-64 list-none flex-col gap-2 overflow-y-auto p-0">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <Button variant="outline" className="w-full justify-between" onClick={() => void add(collection)}>
                    <span className="truncate">{collection.name}</span>
                    <span className="text-xs text-muted-foreground">{collection.itemCount}</span>
                  </Button>
                </li>
              ))}
            </ul>}
        <form className="mt-4 flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); void createAndAdd(); }}>
          <div className="grow"><Input label="New collection" value={name} onChange={(event) => setName(event.target.value)} placeholder="Rewatch list" /></div>
          <Button type="submit" disabled={!name.trim()}>Create and add</Button>
        </form>
        <ModalFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button></ModalFooter>
      </ModalContent>
    </Modal>
  );
}
