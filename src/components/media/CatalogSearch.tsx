import { useEffect, useState } from 'react';
import { api, imageVariant, type CatalogSearch } from '@/lib/api';
import { SearchDropdown } from './SearchDropdown';

export function CatalogSearch({ libraryId }: { libraryId?: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CatalogSearch>({ query: '', groups: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (!libraryId || !term) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void api.catalogSearch(libraryId, term)
        .then((next) => { if (!controller.signal.aborted) setResult(next); })
        .catch(() => { if (!controller.signal.aborted) setResult({ query: term, groups: [] }); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [libraryId, query]);

  const groups = query.trim() ? result.groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      id: item.id,
      title: item.title,
      year: item.year,
      meta: item.meta,
      badge: item.badge,
      posterSrc: imageVariant(item.posterUrl, { width: 80, height: 120, fit: 'cover', format: 'webp' }),
      href: item.kind === 'person' ? `/person/${encodeURIComponent(item.id)}` : `/media/${encodeURIComponent(item.id)}`,
    })),
  })) : [];
  return <SearchDropdown query={query} onQueryChange={setQuery} groups={groups} loading={Boolean(query.trim()) && loading} className="w-52 sm:w-72" />;
}
