import { useState, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PosterInteraction =
  | {
      href: string;
      onClick?: MouseEventHandler<HTMLAnchorElement>;
      target?: React.HTMLAttributeAnchorTarget;
      rel?: string;
      ariaLabel?: string;
    }
  | {
      onClick: MouseEventHandler<HTMLButtonElement>;
      disabled?: boolean;
      ariaLabel?: string;
      href?: never;
    };

export interface PosterProps {
  src?: string;
  title: string;
  alt?: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** Hide the title/subtitle caption below the image (e.g. when a heading already shows it). */
  hideCaption?: boolean;
  /** A CSS aspect-ratio value, such as `2 / 3` or `0.667`. */
  aspectRatio?: CSSProperties['aspectRatio'];
  className?: string;
  imageAreaClassName?: string;
  imageClassName?: string;
  contentClassName?: string;
  interaction?: PosterInteraction;
}

type PosterImageProps = Pick<
  PosterProps,
  'src' | 'title' | 'alt' | 'badge' | 'aspectRatio' | 'imageAreaClassName' | 'imageClassName'
> & { interactive?: boolean };

function PosterImage({
  src,
  title,
  alt = title,
  badge,
  aspectRatio = '2 / 3',
  imageAreaClassName,
  imageClassName,
  interactive,
}: PosterImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    src ? 'loading' : 'error',
  );

  return (
    <div
      className={cn(
        'relative isolate w-full overflow-hidden rounded-lg bg-muted transition-shadow duration-300 motion-reduce:transition-none group-hover:shadow-xl group-hover:shadow-black/40',
        imageAreaClassName,
      )}
      style={{ aspectRatio }}
    >
      {status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-muted"
          data-testid="poster-loading"
        />
      )}

      {src && status !== 'error' && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out motion-reduce:transform-none motion-reduce:transition-none group-hover:scale-[1.04] group-focus-visible:scale-[1.04]',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            imageClassName,
          )}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}

      {status === 'error' && (
        <div
          role="img"
          aria-label={`${alt} image unavailable`}
          className="absolute inset-0 flex items-center justify-center bg-muted px-4 text-center text-sm text-muted-foreground"
        >
          <span aria-hidden="true">Image unavailable</span>
        </div>
      )}

      {badge != null && (
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-background/90 px-2 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
          {badge}
        </span>
      )}

      {interactive && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-[background-color,opacity] duration-300 motion-reduce:transition-none group-hover:bg-black/25 group-hover:opacity-100 group-focus-visible:bg-black/25 group-focus-visible:opacity-100">
          <span className="flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform duration-300 motion-reduce:transform-none motion-reduce:transition-none group-hover:translate-y-0 group-focus-visible:translate-y-0">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </div>
      )}
    </div>
  );
}

function PosterBody({
  src,
  title,
  alt,
  subtitle,
  badge,
  hideCaption,
  aspectRatio,
  imageAreaClassName,
  imageClassName,
  contentClassName,
  interactive,
}: Omit<PosterProps, 'className' | 'interaction'> & { interactive?: boolean }) {
  return (
    <>
      <PosterImage
        key={src ?? 'no-image'}
        src={src}
        title={title}
        alt={alt}
        badge={badge}
        aspectRatio={aspectRatio}
        imageAreaClassName={imageAreaClassName}
        imageClassName={imageClassName}
        interactive={interactive}
      />
      {!hideCaption && (
        <div className={cn('mt-2 min-w-0', contentClassName)}>
          <div className="truncate text-sm font-semibold leading-tight sm:text-base" title={title}>
            {title}
          </div>
          {subtitle != null && (
            <div className="mt-1 truncate text-xs text-muted-foreground sm:text-sm">
              {subtitle}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const rootClasses =
  'group block min-w-0 rounded-lg text-left text-foreground transition-[transform,filter] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none hover:-translate-y-1 hover:drop-shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export function Poster({ className, interaction, ...props }: PosterProps) {
  if (!interaction) {
    return (
      <article className={cn('min-w-0', className)}>
        <PosterBody {...props} />
      </article>
    );
  }

  if ('href' in interaction && interaction.href !== undefined) {
    const { href, onClick, target, rel, ariaLabel } = interaction;
    return (
      <a
        href={href}
        onClick={onClick}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
        className={cn(rootClasses, className)}
      >
        <PosterBody {...props} interactive />
      </a>
    );
  }

  const { onClick, disabled, ariaLabel } = interaction;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        rootClasses,
        'w-full disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <PosterBody {...props} interactive />
    </button>
  );
}
