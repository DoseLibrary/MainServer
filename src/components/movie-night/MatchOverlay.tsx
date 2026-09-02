import { useEffect, type ReactNode } from 'react';
import type { MovieNightCard } from '@/lib/api';
import { MovieCardFace } from './MovieCardFace';

/** Full-screen "It's a match!" used by the phone and the TV. */
export function MatchOverlay({ card, open, title = "It's a match!", subtitle, actions }: { card: MovieNightCard; open: boolean; title?: string; subtitle?: string; actions?: ReactNode }) {
  useEffect(() => {
    if (open) { try { navigator.vibrate?.([100, 50, 100]); } catch { /* unsupported */ } }
  }, [open]);
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/90 p-6 text-white backdrop-blur">
      <p className="text-4xl font-black tracking-tight sm:text-6xl motion-safe:animate-[pulse_1.2s_ease-in-out_2]">{title}</p>
      {subtitle && <p className="text-white/70">{subtitle}</p>}
      <div className="aspect-[2/3] w-64 max-w-[70vw] motion-safe:animate-[zoomIn_400ms_cubic-bezier(.2,.8,.2,1)] sm:w-80"><MovieCardFace card={card} expanded /></div>
      {actions && <div className="flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
