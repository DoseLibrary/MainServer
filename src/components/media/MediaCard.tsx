import { useState, type MouseEventHandler, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MediaCardInteraction =
  | { href: string; onClick?: MouseEventHandler<HTMLAnchorElement>; target?: React.HTMLAttributeAnchorTarget; rel?: string; ariaLabel?: string }
  | { onClick: MouseEventHandler<HTMLButtonElement>; disabled?: boolean; ariaLabel?: string; href?: never };

export interface MediaCardProps {
  title: string;
  imageSrc?: string;
  imageAlt?: string;
  /** Secondary line such as `2026 · 2h 8m` or a genre. */
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** Watch progress from 0 to 1 for a continue-watching bar. */
  progress?: number;
  interaction?: MediaCardInteraction;
  className?: string;
}

interface CardArtworkProps {
  src?: string;
  title: string;
  alt?: string;
  badge?: ReactNode;
  subtitle?: ReactNode;
  progress?: number;
  interactive?: boolean;
}

function CardArtwork({ src, title, alt, badge, subtitle, progress, interactive }: CardArtworkProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error');
  const clampedProgress = progress == null ? null : Math.min(1, Math.max(0, progress));

  return (
    <div className="relative isolate aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {status === 'loading' && <div aria-hidden="true" data-testid="media-card-loading" className="absolute inset-0 animate-pulse bg-muted" />}

      {src && status !== 'error' && (
        <img
          // Eager, like the poster: a carousel scrolls sideways, and a tile that
          // only fetches once visible arrives after the viewer does.
          loading="eager"
          decoding="async"
          src={src}
          alt={alt ?? title}
          // No opacity transition: a cached image is decoded and ready, and half a
          // second of fading in reads as the app being slow. Only hover animates.
          className={cn('absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out motion-reduce:transform-none motion-reduce:transition-none group-hover:scale-[1.04] group-focus-visible:scale-[1.04]', status === 'loaded' ? 'opacity-100' : 'opacity-0')}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}

      {status === 'error' && (
        <div role="img" aria-label={`${alt ?? title} image unavailable`} className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-background p-4 text-center text-sm font-medium text-muted-foreground">
          <span aria-hidden="true">{title}</span>
        </div>
      )}

      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />

      {interactive && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-[background-color,opacity] duration-300 motion-reduce:transition-none group-hover:bg-black/20 group-hover:opacity-100 group-focus-visible:bg-black/20 group-focus-visible:opacity-100">
          <span className="flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform duration-300 motion-reduce:transform-none motion-reduce:transition-none group-hover:translate-y-0 group-focus-visible:translate-y-0">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </div>
      )}

      {badge != null && (
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">{badge}</span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="truncate text-sm font-semibold text-white drop-shadow sm:text-base" title={title}>{title}</div>
        {subtitle != null && (
          <div className="mt-0.5 max-h-0 overflow-hidden text-xs text-white/80 opacity-0 transition-all duration-200 group-hover:mt-1 group-hover:max-h-10 group-hover:opacity-100 group-focus-visible:mt-1 group-focus-visible:max-h-10 group-focus-visible:opacity-100">
            {subtitle}
          </div>
        )}
      </div>

      {clampedProgress != null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
          <div className="h-full bg-primary" style={{ width: `${clampedProgress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

const rootClasses =
  'group block w-full rounded-lg text-left transition-[transform,filter] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-1 hover:drop-shadow-xl';

export function MediaCard({ title, imageSrc, imageAlt, subtitle, badge, progress, interaction, className }: MediaCardProps) {
  const artwork = <CardArtwork src={imageSrc} title={title} alt={imageAlt} badge={badge} subtitle={subtitle} progress={progress} interactive={interaction != null} />;

  if (!interaction) {
    return <article className={cn('group min-w-0', className)}>{artwork}</article>;
  }

  if ('href' in interaction && interaction.href !== undefined) {
    const { href, onClick, target, rel, ariaLabel } = interaction;
    return (
      <a href={href} onClick={onClick} target={target} rel={rel} aria-label={ariaLabel ?? title} className={cn(rootClasses, className)}>
        {artwork}
      </a>
    );
  }

  const { onClick, disabled, ariaLabel } = interaction;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel ?? title} className={cn(rootClasses, 'disabled:cursor-not-allowed disabled:opacity-50', className)}>
      {artwork}
    </button>
  );
}
