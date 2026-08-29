import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CodeBlockProps {
  source: string;
  label?: string;
}

export function CodeBlock({ source, label = 'Example code' }: CodeBlockProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copySource() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(source);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={copySource} aria-label="Copy code">
          {status === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {status === 'copied' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6"><code>{source}</code></pre>
      <span className="sr-only" role="status" aria-live="polite">
        {status === 'copied' ? 'Code copied to clipboard.' : status === 'failed' ? 'Unable to copy code.' : ''}
      </span>
    </div>
  );
}
