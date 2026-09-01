import type { MouseEventHandler, ReactNode } from 'react';
import { Carousel } from '@/components/media/Carousel';
import { Hero } from '@/components/media/Hero';
import { MediaCard } from '@/components/media/MediaCard';
import { Navbar, type NavbarBrandImage } from '@/components/media/Navbar';
import { Poster } from '@/components/media/Poster';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface LibraryNavigationItem<Id extends string = string> {
  id: Id;
  label: ReactNode;
  href: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export interface LibraryNavigation<Id extends string = string> {
  brandLabel: string;
  brand?: ReactNode;
  brandImage?: NavbarBrandImage;
  brandHref?: string;
  items: readonly LibraryNavigationItem<Id>[];
  activeId?: Id;
  actions?: ReactNode;
  navigationLabel?: string;
}

export type LibraryAction =
  | { label: string; href: string; onClick?: MouseEventHandler<HTMLAnchorElement> }
  | { label: string; onClick: MouseEventHandler<HTMLButtonElement>; href?: never };

export interface LibraryFeaturedMedia {
  title: string;
  /** Transparent title logo shown instead of the title text when present. */
  logoSrc?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  /** Optional background trailer for a billboard-style hero. */
  videoSrc?: string;
  videoPoster?: string;
  primaryAction?: LibraryAction;
  secondaryAction?: LibraryAction;
}

export type LibraryItemInteraction =
  | { href: string; onClick?: MouseEventHandler<HTMLAnchorElement>; ariaLabel?: string }
  | { onClick: MouseEventHandler<HTMLButtonElement>; href?: never; ariaLabel?: string; disabled?: boolean };

export interface LibraryItem {
  id: string;
  title: string;
  posterSrc?: string;
  posterAlt?: string;
  /** Landscape artwork used when the section layout is `card`. */
  backdropSrc?: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** Watch progress from 0 to 1, rendered as a bar in `card` layout. */
  progress?: number;
  /** True when the item arrived through a live update; its card fades in. */
  appearing?: boolean;
  /** Warms this item's detail data on hover or focus, so the click is instant. */
  onPrefetch?: () => void;
  interaction?: LibraryItemInteraction;
}

export type LibrarySectionLayout = 'poster' | 'card';

export interface LibrarySection {
  id: string;
  title: string;
  carouselLabel?: string;
  /** `poster` renders portrait posters (default); `card` renders Netflix-style landscape cards. */
  layout?: LibrarySectionLayout;
  items: readonly LibraryItem[];
  action?: LibraryAction;
}

export interface LibraryPageProps<NavigationId extends string = string> {
  navigation: LibraryNavigation<NavigationId>;
  title: string;
  featured?: LibraryFeaturedMedia;
  sections?: readonly LibrarySection[];
  state?: 'loaded' | 'loading' | 'empty' | 'error';
  emptyTitle?: string;
  emptyMessage?: ReactNode;
  emptyAction?: LibraryAction;
  errorTitle?: string;
  errorMessage?: ReactNode;
  onRetry?: () => void;
}

function ActionButton({ action, variant = 'default' }: { action: LibraryAction; variant?: 'default' | 'secondary' | 'outline' }) {
  if (action.href !== undefined) {
    return <Button asChild variant={variant}><a href={action.href} onClick={action.onClick}>{action.label}</a></Button>;
  }
  return <Button type="button" variant={variant} onClick={action.onClick}>{action.label}</Button>;
}

/**
 * The shape of the page, drawn before its content arrives. A spinner tells the
 * viewer to wait; a skeleton tells them what is coming, and the swap to real
 * rows reads as the page filling in rather than replacing itself.
 */
function LibraryLoading({ title }: { title: string }) {
  return (
    <main aria-busy="true" className="min-h-screen">
      <h1 className="sr-only">Loading {title}</h1>
      <Skeleton className="h-[42vh] w-full rounded-none sm:h-[52vh]" />
      <div className="space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        {[0, 1].map((row) => (
          <div key={row} className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton
                  key={index}
                  // Fades the row in left-to-right so the wait has direction.
                  style={{ animationDelay: `${index * 60}ms` }}
                  className={cn('shrink-0 rounded-lg', row === 0 ? 'aspect-video w-60 sm:w-72 lg:w-80' : 'aspect-[2/3] w-36 sm:w-44 lg:w-48')}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function MessageState({ title, message, action }: { title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {message != null && <div className="mt-3 text-muted-foreground">{message}</div>}
      {action != null && <div className="mt-6">{action}</div>}
    </main>
  );
}

export function LibraryPage<NavigationId extends string = string>({
  navigation,
  title,
  featured,
  sections = [],
  state = 'loaded',
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'This library does not have any titles to show.',
  emptyAction,
  errorTitle = 'Library unavailable',
  errorMessage = 'The library could not be displayed. Please try again.',
  onRetry,
}: LibraryPageProps<NavigationId>) {
  const navbar = <Navbar {...navigation} />;

  if (state === 'loading') return <div className="min-h-screen bg-background text-foreground">{navbar}<LibraryLoading title={title} /></div>;
  if (state === 'error') return <div className="min-h-screen bg-background text-foreground">{navbar}<MessageState title={errorTitle} message={errorMessage} action={onRetry ? <Button type="button" onClick={onRetry}>Try again</Button> : undefined} /></div>;
  if (state === 'empty') return <div className="min-h-screen bg-background text-foreground">{navbar}<MessageState title={emptyTitle} message={emptyMessage} action={emptyAction ? <ActionButton action={emptyAction} /> : undefined} /></div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {navbar}
      <main>
        {featured ? (
          <Hero
            title={featured.title}
            logoSrc={featured.logoSrc}
            eyebrow={featured.eyebrow}
            description={featured.description}
            metadata={featured.metadata}
            imageSrc={featured.imageSrc}
            imageAlt={featured.imageAlt}
            videoSrc={featured.videoSrc}
            videoPoster={featured.videoPoster}
            className="rounded-none border-0"
            actions={<>{featured.primaryAction && <ActionButton action={featured.primaryAction} />}{featured.secondaryAction && <ActionButton action={featured.secondaryAction} variant="secondary" />}</>}
          />
        ) : (
          <div className="px-4 pt-6 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          </div>
        )}

        <div className="space-y-10 px-4 py-8 sm:px-6 lg:px-8">
          {sections.map((section, index) => (
            <div key={section.id} className="row-enter" style={{ animationDelay: `${Math.min(index, 4) * 70}ms` }}>
            <Carousel
              key={section.id}
              label={section.carouselLabel ?? section.title}
              heading={section.title}
              headingAction={section.action && <ActionButton action={section.action} variant="outline" />}
              items={section.items}
              getItemKey={(item) => item.id}
              itemClassName={section.layout === 'card' ? 'w-60 sm:w-72 lg:w-80' : 'w-36 sm:w-44 lg:w-48'}
              renderItem={(item) => <div
                className={item.appearing ? 'media-appear' : undefined}
                data-appearing={item.appearing || undefined}
                onPointerEnter={item.onPrefetch}
                onFocusCapture={item.onPrefetch}
              >{section.layout === 'card' ? (
                <MediaCard
                  title={item.title}
                  imageSrc={item.backdropSrc ?? item.posterSrc}
                  imageAlt={item.posterAlt}
                  subtitle={item.subtitle}
                  badge={item.badge}
                  progress={item.progress}
                  interaction={item.interaction}
                />
              ) : (
                <Poster
                  title={item.title}
                  src={item.posterSrc}
                  alt={item.posterAlt}
                  subtitle={item.subtitle}
                  badge={item.badge}
                  interaction={item.interaction}
                />
              )}</div>}
            />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
