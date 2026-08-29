import { CodeBlock } from './CodeBlock';

interface ComponentExampleProps {
  title: string;
  description: string;
  source: string;
  children: React.ReactNode;
}

export function ComponentExample({ title, description, source, children }: ComponentExampleProps) {
  const headingId = `example-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <article className="space-y-6" aria-labelledby={headingId}>
      <header>
        <h1 id={headingId} className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>
      </header>
      <section aria-label={`${title} preview`} className="flex min-h-48 flex-wrap items-center gap-4 rounded-lg border bg-card p-6 sm:p-10">
        {children}
      </section>
      <CodeBlock source={source} />
    </article>
  );
}
