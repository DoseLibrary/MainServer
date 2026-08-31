import { useState } from 'react';
import { api, type TmdbTitleCandidate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from '@/components/ui/modal';

export function MetadataRematch({ open, itemId, kind, initialTitle, onOpenChange, onMatched }: { open: boolean; itemId: string; kind: 'movie' | 'series'; initialTitle: string; onOpenChange(open: boolean): void; onMatched(): void }) {
  const [query, setQuery] = useState(initialTitle); const [results, setResults] = useState<TmdbTitleCandidate[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  async function search() { setBusy(true); setError(undefined); try { setResults((await api.searchTmdb(kind, query)).results); } catch (e) { setError(e instanceof Error ? e.message : 'Search failed.'); } finally { setBusy(false); } }
  async function choose(candidate: TmdbTitleCandidate) { setBusy(true); setError(undefined); try { await api.matchTmdb(itemId, candidate.id); onMatched(); onOpenChange(false); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update metadata.'); } finally { setBusy(false); } }
  return <Modal open={open} onOpenChange={onOpenChange}><ModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><ModalHeader><ModalTitle>Re-match metadata</ModalTitle><ModalDescription>Search TMDB and select the correct title. You can choose its artwork afterwards.</ModalDescription></ModalHeader><form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(); }}><Input aria-label="TMDB title" value={query} onChange={(e) => setQuery(e.target.value)} /><Button disabled={busy || !query.trim()}>Search</Button></form>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<ul className="space-y-2">{results.map((result) => <li key={result.id} className="flex items-center justify-between gap-4 rounded-md border p-3"><div><p className="font-medium">{result.title}{result.year ? ` (${result.year})` : ''}</p>{result.overview && <p className="line-clamp-2 text-sm text-muted-foreground">{result.overview}</p>}</div><Button size="sm" disabled={busy} onClick={() => void choose(result)}>Select</Button></li>)}</ul></ModalContent></Modal>;
}
