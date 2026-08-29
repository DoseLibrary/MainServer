import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, imageVariant, type CatalogItemDetails } from '@/lib/api';
import { MediaDetailsPage } from '@/pages/MediaDetailsPage';
import { Modal, ModalContent } from '@/components/ui/modal';
import { ArtworkManager } from '@/routes/ArtworkManager';

export function CatalogDetails() {
  const { id = '' } = useParams();
  const [item, setItem] = useState<CatalogItemDetails>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [watched, setWatched] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const load = useCallback(async () => {
    setError(undefined);
    try { const next = (await api.catalogItem(id)).item; setItem(next); setSaved(Boolean(next.inWatchlist)); setWatched(Boolean(next.watched)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this title.'); }
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  useEffect(() => { queueMicrotask(async () => { try { const { user } = await api.me(); setIsAdmin(user.role === 'admin'); } catch { setIsAdmin(false); } }); }, []);

  async function toggleWatchlist() {
    const next = !saved;
    setSaved(next); // Optimistic; revert if the request fails.
    try { await api.setWatchlist(id, next); } catch { setSaved(!next); }
  }
  async function toggleWatched() {
    const next = !watched;
    setWatched(next); // Optimistic; revert if the request fails.
    try { await api.markWatched(id, next); } catch { setWatched(!next); }
  }

  const kind = item?.kind === 'show' || item?.kind === 'series' || item?.kind === 'season' ? 'show' : 'movie';
  const episodeLabel = item?.seasonNumber != null || item?.episodeNumber != null
    ? [item.seasonNumber != null ? `Season ${item.seasonNumber}` : undefined, item.episodeNumber != null ? `Episode ${item.episodeNumber}` : undefined].filter(Boolean).join(' · ')
    : undefined;
  // Quality and content rating read as compact chips; genres are clickable chips into browse pages.
  const genreChips = (item?.genres ?? []).map((genre) => (
    <a key={genre.id} href={`/genre/${encodeURIComponent(genre.id)}`} className="hover:underline focus-visible:outline-none focus-visible:underline">{genre.name}</a>
  ));
  const badges = [
    ...[item?.quality?.badge, item?.contentRating].filter((value): value is string => Boolean(value)),
    ...genreChips,
  ];
  const metaPieces: ReactNode[] = [
    item?.year != null ? String(item.year) : null,
    episodeLabel || null,
    item?.runtime || null,
    item?.providerRating != null ? `★ ${item.providerRating.toFixed(1)}` : null,
    item?.collection ? <span key="collection">Part of <a href={`/collection/${encodeURIComponent(item.collection.id)}`} className="hover:underline focus-visible:outline-none focus-visible:underline">{item.collection.name}</a></span> : null,
  ].filter((piece) => piece != null);
  const metadata = metaPieces.length > 0 ? <>{metaPieces.map((piece, index) => <span key={index}>{index > 0 ? '  ·  ' : ''}{piece}</span>)}</> : undefined;
  const recommendations = (item?.recommendations ?? []).map((rec) => ({
    id: rec.id, title: rec.title, posterSrc: imageVariant(rec.posterUrl, { width: 342, height: 513, fit: 'cover', format: 'webp' }),
    subtitle: rec.year != null ? String(rec.year) : undefined, badge: rec.badge,
    interaction: { href: `/media/${encodeURIComponent(rec.id)}` },
  }));
  const cast = (item?.cast ?? []).map((member, index) => ({
    id: member.id ?? `${member.order}-${index}`, name: member.name, role: member.character,
    imageSrc: imageVariant(member.profileUrl, { width: 96, height: 96, fit: 'cover', format: 'webp' }),
    href: member.id ? `/person/${encodeURIComponent(member.id)}` : undefined,
  }));
  // Prefer the flagged trailer, else the first YouTube one; trailers play in an embedded modal.
  const trailer = (item?.trailers ?? []).find((entry) => entry.preferred && entry.site.toLowerCase() === 'youtube')
    ?? (item?.trailers ?? []).find((entry) => entry.site.toLowerCase() === 'youtube');
  const common = {
    title: item?.title ?? 'Media details', backHref: '/', posterSrc: imageVariant(item?.posterUrl, { width: 600, height: 900, fit: 'cover', format: 'webp' }),
    backdropSrc: imageVariant(item?.backdropUrl, { width: 1920, height: 1080, fit: 'cover', format: 'webp', quality: 85 }), overview: item?.overview,
    tagline: item?.tagline, badges: badges.length > 0 ? badges : undefined, recommendations,
    metadata, state: error ? 'error' as const : item ? 'loaded' as const : 'loading' as const,
    errorMessage: error, onRetry: load,
    primaryAction: item && (item.kind === 'movie' || item.kind === 'episode') ? { label: typeof item.progress === 'number' && item.progress > 0 && item.progress < 1 ? 'Resume' : 'Play', href: `/watch/${encodeURIComponent(item.id)}` } : undefined,
    secondaryAction: item && (item.kind === 'movie' || item.kind === 'series') ? { label: saved ? 'In Watch List' : 'Add to Watch List', onClick: () => void toggleWatchlist() } : undefined,
    onPlayTrailer: trailer ? () => setTrailerOpen(true) : undefined,
    trailerLabel: 'Play Trailer',
    watched,
    onToggleWatched: item && (item.kind === 'movie' || item.kind === 'episode') ? () => void toggleWatched() : undefined,
    markWatchedLabel: 'Mark watched',
    markUnwatchedLabel: 'Mark unwatched',
    canManage: isAdmin,
    onEditMetadata: isAdmin && item ? () => setArtworkOpen(true) : undefined,
    manageLabel: 'Change artwork',
  };
  const seasons = (item?.children ?? []).filter((child) => child.kind === 'season').map((season) => ({
    id: season.id,
    name: season.title || (season.seasonNumber != null ? `Season ${season.seasonNumber}` : 'Season'),
    overview: season.overview,
    posterSrc: imageVariant(season.posterUrl, { width: 384, height: 576, fit: 'cover', format: 'webp' }),
    interaction: { href: `/media/${encodeURIComponent(season.id)}` },
  }));
  const episodes = (item?.children ?? []).filter((child) => child.kind === 'episode').map((episode) => ({
    id: episode.id,
    name: episode.title || (episode.episodeNumber != null ? `Episode ${episode.episodeNumber}` : 'Episode'),
    overview: episode.overview,
    posterSrc: imageVariant(episode.posterUrl, { width: 640, height: 360, fit: 'cover', format: 'webp' }),
    progress: episode.progress,
    interaction: { href: `/media/${encodeURIComponent(episode.id)}` },
  }));
  const children = item?.kind === 'season' ? episodes : seasons;
  const page = kind === 'show' ? <MediaDetailsPage kind="show" {...common} seasons={children} seasonsTitle={item?.kind === 'season' ? 'Episodes' : 'Seasons'} /> : <MediaDetailsPage kind="movie" {...common} cast={cast} />;
  return <>
    {page}
    <Modal open={trailerOpen} onOpenChange={setTrailerOpen}>
      <ModalContent aria-label={`${item?.title ?? 'Trailer'} trailer`} className="max-w-3xl p-0">
        {trailer && (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              title={trailer.name || `${item?.title ?? ''} trailer`}
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1`}
              className="h-full w-full"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </ModalContent>
    </Modal>
    {isAdmin && <ArtworkManager open={artworkOpen} itemId={id} onOpenChange={setArtworkOpen} onApplied={() => void load()} />}
  </>;
}
