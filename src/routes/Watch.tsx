import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { Button } from '@/components/ui/button';
import { api, imageVariant, type CatalogItemDetails, type IntroMarker, type MediaSprite, type PlaybackResponse, type UserSettings } from '@/lib/api';
import { detectMediaCapabilities } from '@/lib/media-capabilities';

export function Watch() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  // Marathon mode keeps advancing through the user's queue instead of stopping.
  const marathon = search.get('queue') === '1';
  const [item, setItem] = useState<CatalogItemDetails>();
  const [playback, setPlayback] = useState<PlaybackResponse>();
  const [thumbnails, setThumbnails] = useState<MediaSprite>();
  const [intro, setIntro] = useState<IntroMarker>();
  // Re-negotiating with another audio track swaps dubs or commentary mid-title.
  const [audioTrackIndex, setAudioTrackIndex] = useState<number>();
  // Switching tracks reloads the stream; playback resumes where it left off.
  const positionRef = useRef(0);
  const [resumeAt, setResumeAt] = useState<number>();
  // Playback preferences follow the account, so a chosen speed or caption size
  // is the same on the next device.
  const [settings, setSettings] = useState<UserSettings>();
  // Live session id, so administrators can see this playback while it runs.
  const sessionRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined); setPlayback(undefined); setThumbnails(undefined); setIntro(undefined);
    try {
      const [{ item: nextItem }, nextPlayback] = await Promise.all([api.catalogItem(id), api.playback(id, detectMediaCapabilities(), audioTrackIndex)]);
      setItem(nextItem); setPlayback(nextPlayback);
      // Scrubber previews are optional; a title without a generated sprite just omits them.
      void api.mediaSprites(id).then(({ sprite }) => setThumbnails(sprite)).catch(() => setThumbnails(undefined));
      // Intro markers are optional; a title without one simply hides Skip intro.
      void api.mediaIntro(id).then(({ intro: marker }) => setIntro(marker ?? undefined)).catch(() => setIntro(undefined));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Playback could not be started.'); }
  }, [id, audioTrackIndex]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  useEffect(() => {
    let active = true;
    void api.getSettings().then(({ settings: next }) => { if (active) setSettings(next); })
      .catch(() => { /* defaults are fine when preferences cannot be read */ });
    return () => { active = false; };
  }, []);

  const changeSpeed = (percent: number) => {
    setSettings((current) => (current ? { ...current, playbackSpeedPercent: percent } : current));
    void api.updateSettings({ playbackSpeedPercent: percent }).catch(() => {});
  };

  useEffect(() => {
    if (!playback) return;
    let cancelled = false;
    const method = playback.plan.mode === 'direct' ? 'direct' as const : playback.plan.remux ? 'remux' as const : 'transcode' as const;
    void api.startPlaybackSession({ mediaItemId: id, playMethod: method, durationSeconds: playback.durationSeconds ?? undefined })
      .then(({ session }) => {
        if (cancelled) { void api.endPlaybackSession(session.id).catch(() => {}); return; }
        sessionRef.current = session.id;
      })
      .catch(() => { /* reporting is advisory; playback continues regardless */ });
    // A closed tab never unmounts cleanly, so end the session on pagehide too.
    const end = () => { const current = sessionRef.current; sessionRef.current = undefined; if (current) void api.endPlaybackSession(current).catch(() => {}); };
    window.addEventListener('pagehide', end);
    return () => { cancelled = true; window.removeEventListener('pagehide', end); end(); };
  }, [id, playback]);

  if (error) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-white"><p>{error}</p><div className="flex gap-2"><Button onClick={() => void load()}>Try again</Button><Button asChild variant="outline"><Link to={`/media/${encodeURIComponent(id)}`}>Back</Link></Button></div></main>;
  if (!item || !playback) return <main aria-busy="true" className="flex min-h-screen items-center justify-center bg-black text-white/70">Preparing playback…</main>;
  const poster = imageVariant(item.backdropUrl ?? item.posterUrl, { width: 1920, height: 1080, fit: 'cover', format: 'webp', quality: 85 });
  const cornerPoster = imageVariant(item.posterUrl, { width: 128, height: 192, fit: 'cover', format: 'webp' });
  const detailsHref = `/media/${encodeURIComponent(id)}`;
  const duration = playback.durationSeconds ?? item.files?.[0]?.durationSeconds;
  // Resume from the last saved spot; progress is a 0..1 fraction, so scale by runtime.
  const startPositionSeconds = resumeAt ?? (typeof item.progress === 'number' && item.progress > 0 && item.progress < 1 && duration ? item.progress * duration : undefined);
  const subtitles = (item.subtitles ?? []).map((track) => ({ id: track.id, label: track.label, srcLang: track.language, src: track.url }));
  const nextHref = item.nextEpisodeId ? `/watch/${encodeURIComponent(item.nextEpisodeId)}` : undefined;
  const nextUp = item.nextEpisode ? {
    title: item.nextEpisode.title,
    subtitle: [item.nextEpisode.seasonNumber != null ? `S${item.nextEpisode.seasonNumber}` : undefined,
      item.nextEpisode.episodeNumber != null ? `E${item.nextEpisode.episodeNumber}` : undefined].filter(Boolean).join(' · ') || undefined,
    posterSrc: imageVariant(item.nextEpisode.posterUrl, { width: 176, height: 256, fit: 'cover', format: 'webp' }),
  } : undefined;
  // In marathon mode the queue decides what plays next; an exhausted queue ends quietly.
  const advanceQueue = async () => {
    try {
      const { item: next } = await api.nextInQueue(id);
      if (next) navigate(`/watch/${encodeURIComponent(next.id)}?queue=1`);
    } catch { /* a failed lookup simply ends the marathon */ }
  };
  return <main className="flex min-h-screen items-center bg-black"><VideoPlayer
    src={playback.stream.url}
    castSrc={playback.stream.castUrl ? new URL(playback.stream.castUrl, window.location.href).href : undefined}
    title={item.title}
    subtitles={subtitles}
    meta={[item.year, playback.plan.mode === 'direct' ? 'Direct play' : playback.plan.remux ? 'Remux' : 'Optimized'].filter(Boolean).join(' · ')}
    poster={poster}
    posterSrc={cornerPoster}
    thumbnails={thumbnails}
    backHref={detailsHref}
    onBack={(event) => { event.preventDefault(); navigate(detailsHref); }}
    startPositionSeconds={startPositionSeconds}
    onProgress={(positionSeconds) => {
      positionRef.current = positionSeconds;
      void api.saveProgress(id, positionSeconds).catch(() => {});
      if (sessionRef.current) void api.reportPlayback(sessionRef.current, { positionSeconds }).catch(() => {});
    }}
    onEnded={({ autoAdvanceCancelled }) => {
      void api.saveProgress(id, duration ?? 0, true).catch(() => {});
      // Stopping the countdown means the viewer wants playback to end here.
      if (autoAdvanceCancelled) return;
      if (marathon) void advanceQueue();
      else if (nextHref) navigate(nextHref);
    }}
    nextUp={nextUp}
    onNext={marathon ? () => void advanceQueue() : nextHref ? () => navigate(nextHref) : undefined}
    intro={intro}
    speedPercent={settings?.playbackSpeedPercent ?? 100}
    onSpeedChange={changeSpeed}
    captionStyle={settings ? { sizePercent: settings.subtitleSizePercent, background: settings.subtitleBackground } : undefined}
    audioTracks={(playback.audioTracks ?? []).map((track) => ({ id: String(track.index), label: track.label }))}
    activeAudioId={String(playback.plan.audioTrackIndex ?? 0)}
    onAudioChange={(next) => { setResumeAt(positionRef.current); setAudioTrackIndex(Number(next)); }}
    autoPlay
    className="mx-auto max-h-screen max-w-[min(100vw,177.78vh)] rounded-none"
  /></main>;
}
