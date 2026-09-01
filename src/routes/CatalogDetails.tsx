import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cached, cacheKeys, cachedValue, primeCache } from '@/lib/cache';
import { api, imageVariant, type CatalogItemDetails } from '@/lib/api';
import { MediaDetailsPage } from '@/pages/MediaDetailsPage';
import { ArtworkManager } from '@/routes/ArtworkManager';
import { MetadataRematch } from '@/routes/MetadataRematch';
import { AddToCollectionModal } from '@/components/media/AddToCollectionModal';
import { DownloadModal } from '@/components/media/DownloadModal';
import { supportsDownloads } from '@/lib/download-store';

export function CatalogDetails() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  // Seeded from the cache: a title opened before renders at once, no spinner.
  const cachedItem = cachedValue<CatalogItemDetails>(cacheKeys.catalogItem(id));
  const [item, setItem] = useState<CatalogItemDetails | undefined>(cachedItem);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(Boolean(cachedItem?.inWatchlist));
  const [watched, setWatched] = useState(Boolean(cachedItem?.watched));
  const [isAdmin, setIsAdmin] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [rematchOpen, setRematchOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [queued, setQueued] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const apply = useCallback((next: CatalogItemDetails) => {
    setItem(next); setSaved(Boolean(next.inWatchlist)); setWatched(Boolean(next.watched));
  }, []);
  const load = useCallback(async () => {
    setError(undefined);
    try {
      // A title opened before renders from cache immediately; the refresh that
      // follows corrects progress and watchlist state in place.
      apply(await cached(cacheKeys.catalogItem(id), async () => (await api.catalogItem(id)).item, apply));
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this title.'); }
  }, [id, apply]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  // Mutations below rewrite the cached copy so a later visit is not stale.
  useEffect(() => { if (item) primeCache(cacheKeys.catalogItem(id), item); }, [id, item]);
  useEffect(() => { queueMicrotask(async () => { try { const { user } = await api.me(); setIsAdmin(user.role === 'admin'); } catch { setIsAdmin(false); } }); }, []);

  async function toggleWatchlist() {
    const next = !saved;
    setSaved(next); // Optimistic; revert if the request fails.
    try { await api.setWatchlist(id, next); } catch { setSaved(!next); }
  }
  async function addToQueue() {
    const previous = queued;
    setQueued(true); // Optimistic; revert if the request fails.
    try { await api.addToQueue(id); } catch { setQueued(previous); }
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
  const hasLocalTrailer = Boolean(item?.hasLocalTrailer || (item?.trailers ?? []).some((entry) => entry.localAvailable));
  const common = {
    title: item?.title ?? 'Media details', backHref: '/', posterSrc: imageVariant(item?.posterUrl, { width: 600, height: 900, fit: 'cover', format: 'webp' }),
    backdropSrc: imageVariant(item?.backdropUrl, { width: 1920, height: 1080, fit: 'cover', format: 'webp', quality: 85 }), overview: item?.overview,
    tagline: item?.tagline, badges: badges.length > 0 ? badges : undefined, recommendations,
    metadata, state: error ? 'error' as const : item ? 'loaded' as const : 'loading' as const,
    errorMessage: error, onRetry: load,
    primaryAction: item && (item.kind === 'movie' || item.kind === 'episode') ? { label: typeof item.progress === 'number' && item.progress > 0 && item.progress < 1 ? 'Resume' : 'Play', href: `/watch/${encodeURIComponent(item.id)}` } : undefined,
    secondaryAction: item && (item.kind === 'movie' || item.kind === 'series') ? { label: saved ? 'In Watch List' : 'Add to Watch List', onClick: () => void toggleWatchlist() } : undefined,
    extraActions: item && (item.kind === 'movie' || item.kind === 'series') ? [
      { id: 'add-to-collection', label: 'Add to collection', onClick: () => setCollectionOpen(true) },
      ...(supportsDownloads() && item.kind === 'movie' ? [{ id: 'download', label: 'Download', onClick: () => setDownloadOpen(true) }] : []),
      ...(item.kind === 'movie' ? [{ id: 'add-to-queue', label: queued ? 'In queue' : 'Add to queue', onClick: () => void addToQueue() }] : []),
    ] : undefined,
    onPlayTrailer: hasLocalTrailer ? () => navigate(`/trailer/${encodeURIComponent(id)}`) : undefined,
    onDownload: supportsDownloads() && item && (item.kind === 'movie' || item.kind === 'season' || item.kind === 'episode') ? () => setDownloadOpen(true) : undefined,
    trailerLabel: 'Play Trailer',
    watched,
    onToggleWatched: item && (item.kind === 'movie' || item.kind === 'episode') ? () => void toggleWatched() : undefined,
    markWatchedLabel: 'Mark watched',
    markUnwatchedLabel: 'Mark unwatched',
    canManage: isAdmin,
    onEditMetadata: isAdmin && item ? () => setArtworkOpen(true) : undefined,
    manageLabel: 'Change artwork',
    adminActions: isAdmin && item && (item.kind === 'movie' || item.kind === 'series') ? [{ id: 'rematch', label: 'Re-match metadata', onSelect: () => setRematchOpen(true) }] : undefined,
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
    // Episode stills are stored as the backdrop; fall back to the season poster
    // (this page's own art) rather than showing an empty tile.
    posterSrc: imageVariant(episode.posterUrl ?? episode.backdropUrl ?? item?.posterUrl, { width: 640, height: 360, fit: 'cover', format: 'webp' }),
    progress: episode.progress,
    interaction: { href: `/media/${encodeURIComponent(episode.id)}` },
  }));
  const children = item?.kind === 'season' ? episodes : seasons;
  const page = kind === 'show' ? <MediaDetailsPage kind="show" {...common} seasons={children} seasonsTitle={item?.kind === 'season' ? 'Episodes' : 'Seasons'} /> : <MediaDetailsPage kind="movie" {...common} cast={cast} />;
  return <>
    {page}
    {item && <AddToCollectionModal open={collectionOpen} mediaItemId={id} onOpenChange={setCollectionOpen} />}
    {item && <DownloadModal open={downloadOpen} mediaItemId={id} title={item.title} onOpenChange={setDownloadOpen} />}
    {isAdmin && <ArtworkManager open={artworkOpen} itemId={id} onOpenChange={setArtworkOpen} onApplied={() => void load()} />}
    {isAdmin && item && (item.kind === 'movie' || item.kind === 'series') && <MetadataRematch open={rematchOpen} itemId={id} kind={item.kind} initialTitle={item.title} onOpenChange={setRematchOpen} onMatched={() => { void load(); setArtworkOpen(true); }} />}
  </>;
}
