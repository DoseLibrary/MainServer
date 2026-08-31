import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type CatalogCategorySummary, type RandomItemFilters } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';

export function RandomPickerModal({ open, onOpenChange, onNavigate }: { open: boolean; onOpenChange: (open: boolean) => void; onNavigate?: (href: string) => void }) {
  const [genres, setGenres] = useState<CatalogCategorySummary[]>([]);
  const [filters, setFilters] = useState<RandomItemFilters>({});
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    void api.catalogCategories().then(({ categories }) => setGenres(categories)).catch(() => setGenres([]));
  }, [open]);

  async function pick(next: RandomItemFilters) {
    setLoading(true); setEmpty(false); setError(undefined);
    try {
      const { item } = await api.randomItem(next);
      onOpenChange(false);
      const href = `/media/${encodeURIComponent(item.id)}`;
      if (onNavigate) onNavigate(href); else window.location.assign(href);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) setEmpty(true);
      else setError(caught instanceof Error ? caught.message : 'Could not pick a title.');
    } finally { setLoading(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void pick(filters); }
  const number = (value: string) => value === '' ? undefined : Number(value);

  return <Modal open={open} onOpenChange={onOpenChange}>
    <ModalContent aria-describedby="random-picker-description">
      <ModalHeader><ModalTitle>Pick something to watch</ModalTitle><ModalDescription id="random-picker-description">Go fully random or narrow the choices.</ModalDescription></ModalHeader>
      <form onSubmit={submit} className="space-y-4">
        <Button type="button" className="w-full" disabled={loading} onClick={() => void pick({})}>{loading ? 'Picking…' : 'Surprise me'}</Button>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm"><span>Kind</span><select aria-label="Kind" className="h-10 w-full rounded-md border bg-background px-3" value={filters.kind ?? ''} onChange={(e) => setFilters((old) => ({ ...old, kind: (e.target.value || undefined) as RandomItemFilters['kind'] }))}><option value="">Any</option><option value="movie">Movie</option><option value="series">Series</option></select></label>
          <label className="space-y-1 text-sm"><span>Genre</span><select aria-label="Genre" className="h-10 w-full rounded-md border bg-background px-3" value={filters.genre ?? ''} onChange={(e) => setFilters((old) => ({ ...old, genre: e.target.value || undefined }))}><option value="">Any</option>{genres.map((genre) => <option key={genre.key} value={genre.key}>{genre.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>From year</span><Input aria-label="From year" type="number" min={1888} max={2200} value={filters.yearMin ?? ''} onChange={(e) => setFilters((old) => ({ ...old, yearMin: number(e.target.value) }))} /></label>
          <label className="space-y-1 text-sm"><span>To year</span><Input aria-label="To year" type="number" min={1888} max={2200} value={filters.yearMax ?? ''} onChange={(e) => setFilters((old) => ({ ...old, yearMax: number(e.target.value) }))} /></label>
          <label className="col-span-2 space-y-1 text-sm"><span>Minimum rating</span><Input aria-label="Minimum rating" type="number" min={0} max={10} step={0.1} value={filters.ratingMin ?? ''} onChange={(e) => setFilters((old) => ({ ...old, ratingMin: number(e.target.value) }))} /></label>
        </div>
        {empty && <p role="status" className="text-sm text-muted-foreground">Nothing matches — loosen your filters.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ModalFooter><Button type="submit" disabled={loading}>{loading ? 'Picking…' : 'Pick with filters'}</Button></ModalFooter>
      </form>
    </ModalContent>
  </Modal>;
}
