import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CatalogCategorySummary } from '@/lib/api';
import { Navbar } from '@/components/media/Navbar';
import { Button } from '@/components/ui/button';

export function CategoriesPage() {
  const [categories, setCategories] = useState<CatalogCategorySummary[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setCategories((await api.catalogCategories()).categories); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load categories.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar brandLabel="DOSE" brand="DOSE" brandHref="/" items={[{ id: 'library', label: 'Library', href: '/' }, { id: 'categories', label: 'Categories', href: '/categories' }]} activeId="categories" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="border-b pb-6">
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse your library by genre.</p>
        </header>
        {error ? (
          <section className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => void load()}>Try again</Button>
          </section>
        ) : !categories ? (
          <p role="status" className="py-20 text-center text-muted-foreground">Loading…</p>
        ) : categories.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">No categories are available yet. Scan a library to populate them.</p>
        ) : (
          <ul className="mt-6 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 md:grid-cols-4">
            {categories.map((category) => (
              <li key={category.key}>
                <Link
                  to={`/category/${encodeURIComponent(category.key)}`}
                  className="flex h-full flex-col justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="text-lg font-semibold tracking-tight">{category.name}</span>
                  <span className="mt-2 text-sm text-muted-foreground">{category.count} {category.count === 1 ? 'title' : 'titles'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
