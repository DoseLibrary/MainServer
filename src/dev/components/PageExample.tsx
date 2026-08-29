import { useState, type ReactNode } from 'react';
import { ExternalLink, Monitor, Smartphone, Tablet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeBlock } from './CodeBlock';
import { IframePreview } from './IframePreview';

const viewports = {
  mobile: { label: 'Mobile', width: 390, icon: Smartphone },
  tablet: { label: 'Tablet', width: 834, icon: Tablet },
  desktop: { label: 'Desktop', width: 1920, icon: Monitor },
} as const;

type ViewportKey = keyof typeof viewports;
const order: readonly ViewportKey[] = ['mobile', 'tablet', 'desktop'];

interface PageExampleProps {
  id: string;
  title: string;
  description: string;
  source: string;
  children: ReactNode;
}

export function PageExample({ id, title, description, source, children }: PageExampleProps) {
  const [viewport, setViewport] = useState<ViewportKey>('desktop');
  const headingId = `example-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const active = viewports[viewport];

  return (
    <article className="space-y-6" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id={headingId} className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href={`/dev/full?id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" className="h-4 w-4" />Open full page
          </a>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Preview viewport">
        {order.map((key) => {
          const vp = viewports[key];
          const Icon = vp.icon;
          const selected = key === viewport;
          return (
            <Button key={key} type="button" size="sm" variant={selected ? 'default' : 'outline'} className="gap-2" aria-pressed={selected} onClick={() => setViewport(key)}>
              <Icon aria-hidden="true" className="h-4 w-4" />{vp.label}
            </Button>
          );
        })}
        <span className="ml-1 text-sm text-muted-foreground">
          {typeof active.width === 'number' ? `${active.width}px` : 'Full width'}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card p-4" aria-label={`${title} preview`}>
        <div className="mx-auto shadow-sm ring-1 ring-border" style={{ width: active.width }}>
          <IframePreview title={`${title} preview`} width="100%" height={720}>
            {children}
          </IframePreview>
        </div>
      </div>

      <CodeBlock source={source} />
    </article>
  );
}
