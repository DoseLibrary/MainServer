import type { ComponentProps, MouseEventHandler, ReactNode } from 'react';
import { ArrowLeft, Check, Eye, MoreHorizontal, PlayCircle } from 'lucide-react';
import { Carousel } from '@/components/media/Carousel';
import { Navbar } from '@/components/media/Navbar';
import { Poster } from '@/components/media/Poster';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export type MediaDetailsAction =
  | { label: string; href: string; onClick?: MouseEventHandler<HTMLAnchorElement> }
  | { label: string; onClick: MouseEventHandler<HTMLButtonElement>; href?: never };

export type MediaCollectionInteraction =
  | { href: string; onClick?: MouseEventHandler<HTMLAnchorElement>; ariaLabel?: string }
  | { onClick: MouseEventHandler<HTMLButtonElement>; href?: never; ariaLabel?: string; disabled?: boolean };

export interface MediaRelatedItem {
  id: string;
  title: string;
  posterSrc?: string;
  posterAlt?: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  interaction?: MediaCollectionInteraction;
}

export interface CastMember {
  id: string;
  name: string;
  role?: ReactNode;
  imageSrc?: string;
  /** Links the cast card to the person's page when provided. */
  href?: string;
}

export interface SeasonSummary {
  id: string;
  name: string;
  overview?: ReactNode;
  episodeCount?: number;
  posterSrc?: string;
  posterAlt?: string;
  /** Watch progress 0..1; renders a resume bar (partial) or a watched marker (1). */
  progress?: number;
  interaction?: MediaCollectionInteraction;
}

interface MediaDetailsBaseProps {
  navigation?: ComponentProps<typeof Navbar>;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  title: string;
  tagline?: ReactNode;
  metadata?: ReactNode;
  badges?: readonly ReactNode[];
  overview?: ReactNode;
  backdropSrc?: string;
  backdropAlt?: string;
  posterSrc?: string;
  posterAlt?: string;
  primaryAction?: MediaDetailsAction;
  secondaryAction?: MediaDetailsAction;
  /** When provided, a "Play trailer" button is shown (i.e. a trailer exists). */
  onPlayTrailer?: () => void;
  trailerLabel?: string;
  /** Watched toggle. Rendered only when `onToggleWatched` is supplied. */
  watched?: boolean;
  onToggleWatched?: () => void;
  markWatchedLabel?: string;
  markUnwatchedLabel?: string;
  /** Gates the management menu (edit metadata, etc.) to server admins/mods. */
  canManage?: boolean;
  onEditMetadata?: () => void;
  manageLabel?: string;
  /** Extra admin actions appended to the management menu. */
  adminActions?: readonly MediaAdminAction[];
  recommendations?: readonly MediaRelatedItem[];
  recommendationsTitle?: string;
  state?: 'loaded' | 'loading' | 'error';
  errorTitle?: string;
  errorMessage?: ReactNode;
  onRetry?: () => void;
}

export interface MediaAdminAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface MovieDetailsProps extends MediaDetailsBaseProps {
  kind: 'movie';
  cast?: readonly CastMember[];
  castTitle?: string;
}

export interface ShowDetailsProps extends MediaDetailsBaseProps {
  kind: 'show';
  seasons?: readonly SeasonSummary[];
  seasonsTitle?: string;
}

export type MediaDetailsPageProps = MovieDetailsProps | ShowDetailsProps;

function ActionButton({ action, variant = 'default', size = 'lg' }: { action: MediaDetailsAction; variant?: 'default' | 'secondary' | 'outline'; size?: 'default' | 'lg' }) {
  if (action.href !== undefined) {
    return <Button asChild variant={variant} size={size}><a href={action.href} onClick={action.onClick}>{action.label}</a></Button>;
  }
  return <Button type="button" variant={variant} size={size} onClick={action.onClick}>{action.label}</Button>;
}

type DetailsActionsProps = Pick<
  MediaDetailsBaseProps,
  'primaryAction' | 'secondaryAction' | 'onPlayTrailer' | 'trailerLabel' | 'watched' | 'onToggleWatched' | 'markWatchedLabel' | 'markUnwatchedLabel' | 'canManage' | 'onEditMetadata' | 'manageLabel' | 'adminActions'
>;

function DetailsActions({
  primaryAction,
  secondaryAction,
  onPlayTrailer,
  trailerLabel = 'Play trailer',
  watched = false,
  onToggleWatched,
  markWatchedLabel = 'Mark as watched',
  markUnwatchedLabel = 'Watched',
  canManage = false,
  onEditMetadata,
  manageLabel = 'Manage',
  adminActions,
}: DetailsActionsProps) {
  const showManage = canManage && (onEditMetadata !== undefined || (adminActions?.length ?? 0) > 0);
  const hasAny = primaryAction || secondaryAction || onPlayTrailer || onToggleWatched || showManage;
  if (!hasAny) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      {primaryAction && <ActionButton action={primaryAction} />}

      {onPlayTrailer && (
        <Button type="button" variant="secondary" size="lg" className="gap-2" onClick={onPlayTrailer}>
          <PlayCircle aria-hidden="true" className="h-5 w-5" />{trailerLabel}
        </Button>
      )}

      {onToggleWatched && (
        <Button type="button" variant="outline" size="lg" className="gap-2" aria-pressed={watched} onClick={onToggleWatched}>
          {watched ? <Check aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
          {watched ? markUnwatchedLabel : markWatchedLabel}
        </Button>
      )}

      {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}

      {showManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="lg" className="gap-2">
              <MoreHorizontal aria-hidden="true" className="h-5 w-5" />{manageLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Manage</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {onEditMetadata && <DropdownMenuItem onSelect={onEditMetadata}>Edit metadata</DropdownMenuItem>}
            {adminActions?.map((action) => (
              <DropdownMenuItem key={action.id} disabled={action.disabled} onSelect={action.onSelect}>{action.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function BackControl({ backHref, onBack, backLabel = 'Back' }: Pick<MediaDetailsBaseProps, 'backHref' | 'onBack' | 'backLabel'>) {
  if (backHref === undefined && onBack === undefined) return null;
  const content = <><ArrowLeft aria-hidden="true" className="h-4 w-4" />{backLabel}</>;
  if (backHref !== undefined) {
    return <Button asChild variant="ghost" size="sm" className="gap-2"><a href={backHref} onClick={onBack ? () => onBack() : undefined}>{content}</a></Button>;
  }
  return <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={onBack}>{content}</Button>;
}

function Backdrop({ src, alt }: { src?: string; alt: string }) {
  return (
    <div className="absolute inset-0 -z-10 bg-muted">
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div role="img" aria-label={`${alt} unavailable`} className="h-full w-full bg-gradient-to-br from-muted to-background" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
    </div>
  );
}

function DetailsShell({ navigation, children }: { navigation?: ComponentProps<typeof Navbar>; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {navigation ? <Navbar {...navigation} /> : null}
      {children}
    </div>
  );
}

function LoadingState({ navigation, title }: { navigation?: ComponentProps<typeof Navbar>; title: string }) {
  return (
    <DetailsShell navigation={navigation}>
      <main aria-busy="true" aria-label={`Loading ${title}`} className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="sr-only">{title}</h1>
        <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <Skeleton className="aspect-[2/3] w-40 rounded-lg sm:w-full" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <div className="flex gap-3"><Skeleton className="h-11 w-32" /><Skeleton className="h-11 w-40" /></div>
          </div>
        </div>
        <section aria-hidden="true" className="space-y-3">
          <Skeleton className="h-7 w-48" />
          <div className="flex gap-3 overflow-hidden sm:gap-4">
            {[0, 1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="aspect-[2/3] w-36 shrink-0 sm:w-44" />)}
          </div>
        </section>
      </main>
    </DetailsShell>
  );
}

function ErrorState({ navigation, errorTitle = 'Details unavailable', errorMessage = 'We could not load this title. Please try again.', onRetry }: Pick<MediaDetailsBaseProps, 'navigation' | 'errorTitle' | 'errorMessage' | 'onRetry'>) {
  return (
    <DetailsShell navigation={navigation}>
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center" role="alert">
        <h1 className="text-3xl font-bold tracking-tight">{errorTitle}</h1>
        {errorMessage != null && <div className="mt-3 text-muted-foreground">{errorMessage}</div>}
        {onRetry && <div className="mt-6"><Button type="button" onClick={onRetry}>Try again</Button></div>}
      </main>
    </DetailsShell>
  );
}

function RelatedRow({ id, title, items }: { id: string; title: string; items: readonly MediaRelatedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`media-related-${id}`}>
      <h2 id={`media-related-${id}`} className="mb-3 text-xl font-semibold">{title}</h2>
      <Carousel
        label={title}
        items={items}
        getItemKey={(item) => item.id}
        itemClassName="w-36 sm:w-44 lg:w-48"
        renderItem={(item) => (
          <Poster title={item.title} src={item.posterSrc} alt={item.posterAlt} subtitle={item.subtitle} badge={item.badge} interaction={item.interaction} />
        )}
      />
    </section>
  );
}

function CastRow({ title, cast }: { title: string; cast: readonly CastMember[] }) {
  if (cast.length === 0) return null;
  return (
    <section aria-labelledby="media-cast">
      <h2 id="media-cast" className="mb-3 text-xl font-semibold">{title}</h2>
      <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
        {cast.map((member) => {
          const body = (
            <Card className="flex h-full items-center gap-3 p-3">
              <Avatar src={member.imageSrc} alt={member.name} className="h-12 w-12" />
              <div className="min-w-0">
                <div className="truncate font-medium leading-tight" title={member.name}>{member.name}</div>
                {member.role != null && <div className="truncate text-sm text-muted-foreground">{member.role}</div>}
              </div>
            </Card>
          );
          return (
            <li key={member.id}>
              {member.href ? (
                <a href={member.href} aria-label={member.name} className="block rounded-lg transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</a>
              ) : body}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SeasonsList({ title, seasons }: { title: string; seasons: readonly SeasonSummary[] }) {
  if (seasons.length === 0) return null;
  return (
    <section aria-labelledby="media-seasons">
      <h2 id="media-seasons" className="mb-3 text-xl font-semibold">{title}</h2>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {seasons.map((season) => {
          const body = (
            <div className="flex gap-4">
              <div className="w-20 shrink-0"><Poster title={season.name} src={season.posterSrc} alt={season.posterAlt} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-tight">{season.name}</div>
                {season.episodeCount != null && <div className="mt-0.5 text-sm text-muted-foreground">{season.episodeCount} episodes</div>}
                {season.progress === 1
                  ? <div className="mt-1 text-xs font-medium text-emerald-600">Watched</div>
                  : typeof season.progress === 'number' && season.progress > 0 && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min(1, season.progress) * 100)}%` }} /></div>
                  )}
                {season.overview != null && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{season.overview}</p>}
              </div>
            </div>
          );
          const interaction = season.interaction;
          return (
            <li key={season.id}>
              {interaction && 'href' in interaction && interaction.href !== undefined ? (
                <a href={interaction.href} onClick={interaction.onClick} aria-label={interaction.ariaLabel ?? `Open ${season.name}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="h-full p-4 transition-shadow hover:shadow-md"><CardContent className="p-0">{body}</CardContent></Card>
                </a>
              ) : interaction && interaction.onClick ? (
                <button type="button" onClick={interaction.onClick} disabled={interaction.disabled} aria-label={interaction.ariaLabel ?? `Open ${season.name}`} className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                  <Card className="h-full p-4 transition-shadow hover:shadow-md"><CardContent className="p-0">{body}</CardContent></Card>
                </button>
              ) : (
                <Card className="h-full p-4"><CardContent className="p-0">{body}</CardContent></Card>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MediaDetailsPage(props: MediaDetailsPageProps) {
  const {
    navigation,
    backHref,
    onBack,
    backLabel,
    title,
    tagline,
    metadata,
    badges,
    overview,
    backdropSrc,
    backdropAlt,
    posterSrc,
    posterAlt,
    primaryAction,
    secondaryAction,
    onPlayTrailer,
    trailerLabel,
    watched,
    onToggleWatched,
    markWatchedLabel,
    markUnwatchedLabel,
    canManage,
    onEditMetadata,
    manageLabel,
    adminActions,
    recommendations = [],
    recommendationsTitle = 'More like this',
    state = 'loaded',
  } = props;

  if (state === 'loading') return <LoadingState navigation={navigation} title={title} />;
  if (state === 'error') return <ErrorState navigation={navigation} errorTitle={props.errorTitle} errorMessage={props.errorMessage} onRetry={props.onRetry} />;

  const resolvedBackdropAlt = backdropAlt ?? `${title} backdrop`;

  return (
    <DetailsShell navigation={navigation}>
      <main className="pb-16">
        <header className="relative isolate">
          <Backdrop src={backdropSrc} alt={resolvedBackdropAlt} />
          <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
            <BackControl backHref={backHref} onBack={onBack} backLabel={backLabel} />
            <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10">
              <div className="w-36 sm:w-full">
                <Poster title={title} src={posterSrc} alt={posterAlt ?? `${title} poster`} hideCaption />
              </div>
              <div className="min-w-0">
                {badges != null && badges.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {badges.map((badge, index) => (
                      <span key={index} className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground">{badge}</span>
                    ))}
                  </div>
                )}
                <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
                {tagline != null && <p className="mt-2 text-lg text-muted-foreground">{tagline}</p>}
                {metadata != null && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">{metadata}</div>
                )}
                {overview != null && <div className="mt-5 max-w-2xl text-sm leading-relaxed text-foreground/90 sm:text-base">{overview}</div>}
                <DetailsActions
                  primaryAction={primaryAction}
                  secondaryAction={secondaryAction}
                  onPlayTrailer={onPlayTrailer}
                  trailerLabel={trailerLabel}
                  watched={watched}
                  onToggleWatched={onToggleWatched}
                  markWatchedLabel={markWatchedLabel}
                  markUnwatchedLabel={markUnwatchedLabel}
                  canManage={canManage}
                  onEditMetadata={onEditMetadata}
                  manageLabel={manageLabel}
                  adminActions={adminActions}
                />
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-12 px-4 pt-10 sm:px-6 lg:px-8">
          {props.kind === 'movie'
            ? <CastRow title={props.castTitle ?? 'Cast'} cast={props.cast ?? []} />
            : <SeasonsList title={props.seasonsTitle ?? 'Seasons'} seasons={props.seasons ?? []} />}
          <RelatedRow id="recommendations" title={recommendationsTitle} items={recommendations} />
        </div>
      </main>
    </DetailsShell>
  );
}
