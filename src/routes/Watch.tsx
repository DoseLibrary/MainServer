import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { Button } from '@/components/ui/button';
import { api, imageVariant, type CatalogItemDetails, type PlaybackResponse } from '@/lib/api';
import { detectMediaCapabilities } from '@/lib/media-capabilities';

export function Watch() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<CatalogItemDetails>();
  const [playback, setPlayback] = useState<PlaybackResponse>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined); setPlayback(undefined);
    try {
      const [{ item: nextItem }, nextPlayback] = await Promise.all([api.catalogItem(id), api.playback(id, detectMediaCapabilities())]);
      setItem(nextItem); setPlayback(nextPlayback);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Playback could not be started.'); }
  }, [id]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  if (error) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-white"><p>{error}</p><div className="flex gap-2"><Button onClick={() => void load()}>Try again</Button><Button asChild variant="outline"><Link to={`/media/${encodeURIComponent(id)}`}>Back</Link></Button></div></main>;
  if (!item || !playback) return <main aria-busy="true" className="flex min-h-screen items-center justify-center bg-black text-white/70">Preparing playback…</main>;
  const poster = imageVariant(item.backdropUrl ?? item.posterUrl, { width: 1920, height: 1080, fit: 'cover', format: 'webp', quality: 85 });
  const cornerPoster = imageVariant(item.posterUrl, { width: 128, height: 192, fit: 'cover', format: 'webp' });
  const detailsHref = `/media/${encodeURIComponent(id)}`;
  const duration = playback.durationSeconds ?? item.files?.[0]?.durationSeconds;
  // Resume from the last saved spot; progress is a 0..1 fraction, so scale by runtime.
  const startPositionSeconds = typeof item.progress === 'number' && item.progress > 0 && item.progress < 1 && duration ? item.progress * duration : undefined;
  const subtitles = (item.subtitles ?? []).map((track) => ({ id: track.id, label: track.label, srcLang: track.language, src: track.url }));
  const nextHref = item.nextEpisodeId ? `/watch/${encodeURIComponent(item.nextEpisodeId)}` : undefined;
  return <main className="flex min-h-screen items-center bg-black"><VideoPlayer
    src={playback.stream.url}
    title={item.title}
    subtitles={subtitles}
    meta={[item.year, playback.plan.mode === 'direct' ? 'Direct play' : playback.plan.remux ? 'Remux' : 'Optimized'].filter(Boolean).join(' · ')}
    poster={poster}
    posterSrc={cornerPoster}
    backHref={detailsHref}
    onBack={(event) => { event.preventDefault(); navigate(detailsHref); }}
    startPositionSeconds={startPositionSeconds}
    onProgress={(positionSeconds) => { void api.saveProgress(id, positionSeconds).catch(() => {}); }}
    onEnded={() => {
      void api.saveProgress(id, duration ?? 0, true).catch(() => {});
      // Autoplay the next episode when one exists; the fresh /watch route auto-plays.
      if (nextHref) navigate(nextHref);
    }}
    onNext={nextHref ? () => navigate(nextHref) : undefined}
    autoPlay
    className="mx-auto max-h-screen max-w-[min(100vw,177.78vh)] rounded-none"
  /></main>;
}
