import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useThemeStore } from '@/store/theme';

interface IframePreviewProps {
  title: string;
  width: number | string;
  height?: number;
  children: ReactNode;
}

function syncHead(doc: Document) {
  doc.head.querySelectorAll('style,link[rel="stylesheet"]').forEach((node) => node.remove());
  document.head.querySelectorAll('style,link[rel="stylesheet"]').forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });
}

/**
 * Renders children inside a same-origin iframe so the preview establishes its
 * own viewport. Tailwind's width-based breakpoints then respond to the iframe
 * width, letting the docs switch device layouts by resizing the iframe without
 * remounting it. The root theme class is mirrored via a store subscription.
 */
export function IframePreview({ title, width, height = 720, children }: IframePreviewProps) {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  const attachIframe = useCallback((el: HTMLIFrameElement | null) => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    if (!el) {
      setMount(null);
      return;
    }
    const doc = el.contentDocument;
    if (!doc) return;
    const applyTheme = () => {
      doc.documentElement.className = document.documentElement.className;
    };
    applyTheme();
    doc.body.className = 'bg-background text-foreground';
    syncHead(doc);
    unsubscribe.current = useThemeStore.subscribe(applyTheme);
    setMount(doc.body);
  }, []);

  const style: CSSProperties = { width, height, maxWidth: '100%' };

  return (
    <>
      <iframe ref={attachIframe} title={title} className="block border-0 bg-background" style={style} />
      {mount ? createPortal(children, mount) : null}
    </>
  );
}
