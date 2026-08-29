import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pageCatalog } from './pageCatalog';

/**
 * Renders a single page fixture full-screen at the real browser viewport, so a
 * preview can be opened in its own tab as the complete page rather than a
 * bounded docs preview.
 */
export function DevFullPage() {
  const id = new URLSearchParams(window.location.search).get('id');
  const item = pageCatalog.find((entry) => entry.id === id);

  if (!item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
        <h1 className="text-2xl font-bold">Unknown page preview</h1>
        <p className="text-muted-foreground">No page fixture matches <code>{id}</code>.</p>
        <Button asChild><a href="/dev">Back to docs</a></Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="fixed bottom-4 left-4 z-50">
        <Button asChild size="sm" variant="secondary" className="gap-2 shadow-md">
          <a href={`/dev?component=${encodeURIComponent(item.id)}`}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to docs
          </a>
        </Button>
      </div>
      {item.preview}
    </div>
  );
}
