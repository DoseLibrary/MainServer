import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HeroAlignment = 'start' | 'center';

export interface HeroProps {
  imageSrc?: string;
  imageAlt?: string;
  /** Optional background trailer. Falls back to `videoPoster`/`imageSrc` when unset or reduced motion is preferred. */
  videoSrc?: string;
  /** Poster frame shown before the trailer plays and as the reduced-motion still. */
  videoPoster?: string;
  title: ReactNode;
  /** Transparent title logo rendered in place of the title text when set. */
  logoSrc?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  /** Native links and buttons supplied here retain their own behavior and semantics. */
  actions?: ReactNode;
  alignment?: HeroAlignment;
  className?: string;
  imageClassName?: string;
  overlayClassName?: string;
  contentClassName?: string;
  actionsClassName?: string;
}

interface HeroArtworkProps {
  src?: string;
  alt: string;
  imageClassName?: string;
}

function HeroArtwork({ src, alt, imageClassName }: HeroArtworkProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    src ? 'loading' : 'error',
  );

  return (
    <div className="absolute inset-0 bg-muted">
      {status === 'loading' && (
        <div
          aria-hidden="true"
          data-testid="hero-loading"
          className="absolute inset-0 animate-pulse bg-muted"
        />
      )}

      {src && status !== 'error' && (
        <img
          src={src}
          alt={alt}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
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
          aria-label={`${alt} unavailable`}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-background text-sm text-muted-foreground"
        >
          <span aria-hidden="true">Artwork unavailable</span>
        </div>
      )}
    </div>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

interface HeroVideoProps {
  src: string;
  poster?: string;
  alt: string;
}

function HeroVideo({ src, poster, alt }: HeroVideoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reducedMotion) {
      video.pause();
      return;
    }
    const attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => undefined);
  }, [reducedMotion, src]);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play(); else video.pause();
  }
  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    const next = !video.muted;
    video.muted = next;
    setMuted(next);
  }

  return (
    <div className="absolute inset-0 bg-muted">
      <video
        ref={videoRef}
        src={src}
        className="absolute inset-0 h-full w-full object-cover"
        poster={poster}
        muted={muted}
        loop
        playsInline
        autoPlay={!reducedMotion}
        preload="metadata"
        aria-label={alt}
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="absolute bottom-3 right-3 z-20 flex gap-2 sm:bottom-4 sm:right-4">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause trailer' : 'Play trailer'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute trailer' : 'Mute trailer'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {muted ? <VolumeX aria-hidden="true" className="h-4 w-4" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function Hero({
  imageSrc,
  imageAlt,
  videoSrc,
  videoPoster,
  title,
  logoSrc,
  eyebrow,
  description,
  metadata,
  actions,
  alignment = 'start',
  className,
  imageClassName,
  overlayClassName,
  contentClassName,
  actionsClassName,
}: HeroProps) {
  const fallbackAlt = imageAlt ?? (typeof title === 'string' ? `${title} backdrop` : 'Hero backdrop');
  const centered = alignment === 'center';

  return (
    <section
      className={cn(
        'relative isolate flex min-h-[24rem] w-full overflow-hidden rounded-lg bg-muted sm:min-h-[30rem] lg:min-h-[36rem]',
        centered ? 'items-center' : 'items-end',
        className,
      )}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {videoSrc ? (
        <HeroVideo key={videoSrc} src={videoSrc} poster={videoPoster ?? imageSrc} alt={fallbackAlt} />
      ) : (
        <HeroArtwork
          key={imageSrc ?? 'no-image'}
          src={imageSrc}
          alt={fallbackAlt}
          imageClassName={imageClassName}
        />
      )}

      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/20',
          centered && 'bg-black/60',
          overlayClassName,
        )}
      />

      <div
        className={cn(
          'relative z-10 w-full max-w-3xl p-5 text-white sm:p-8 lg:p-12',
          centered && 'mx-auto text-center',
          contentClassName,
        )}
      >
        {eyebrow != null && (
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/80 sm:text-sm">
            {eyebrow}
          </div>
        )}

        <h1 className="text-balance break-words text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl">
          {logoSrc ? (
            <>
              <img
                src={logoSrc}
                alt={typeof title === 'string' ? title : ''}
                className="max-h-24 w-auto max-w-full object-contain object-left drop-shadow-lg sm:max-h-32 lg:max-h-40"
              />
              {typeof title === 'string' && <span className="sr-only">{title}</span>}
            </>
          ) : (
            title
          )}
        </h1>

        {metadata != null && (
          <div
            className={cn(
              'mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-white/85',
              centered && 'justify-center',
            )}
          >
            {metadata}
          </div>
        )}

        {description != null && (
          <div className={cn(
            'mt-4 max-w-2xl text-sm leading-relaxed text-white/90 sm:text-base lg:text-lg',
            centered && 'mx-auto',
          )}>
            {description}
          </div>
        )}

        {actions != null && (
          <div
            className={cn(
              'mt-6 flex flex-wrap items-center gap-3 [&_a]:rounded-md [&_button]:rounded-md [&_a:focus-visible]:outline-none [&_button:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_button:focus-visible]:ring-2 [&_a:focus-visible]:ring-white [&_button:focus-visible]:ring-white [&_a:focus-visible]:ring-offset-2 [&_button:focus-visible]:ring-offset-2 [&_a:focus-visible]:ring-offset-black [&_button:focus-visible]:ring-offset-black',
              centered && 'justify-center',
              actionsClassName,
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
