import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { Button } from '@/components/ui/button';
import { api, imageVariant, type CatalogItemDetails, type ChapterMarker, type IntroMarker, type MediaSprite, type PlaybackResponse, type UserSettings } from '@/lib/api';
import { detectMediaCapabilities } from '@/lib/media-capabilities';
import { warmedPlayback } from '@/lib/playback-prewarm';

/** Rungs offered below the source; anything at or above it is just the source. */
const QUALITY_RUNGS = [2160, 1440, 1080, 720, 480];

export function Watch() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  // Marathon mode keeps advancing through the user's queue instead of stopping.
  const marathon = search.get('queue') === '1';
  // A download plays from the device; the service worker serves this path.
  const offlineSrc = search.get('offline') ?? undefined;
  // "Play from start" on the details page: saved progress is ignored for this visit.
  const fromStart = search.get('start') === '0';
  const [item, setItem] = useState<CatalogItemDetails>();
  const [playback, setPlayback] = useState<PlaybackResponse>();
  const [thumbnails, setThumbnails] = useState<MediaSprite>();
  const [intro, setIntro] = useState<IntroMarker>();
  const [chapters, setChapters] = useState<ChapterMarker[]>([]);
  // Re-negotiating with another audio track swaps dubs or commentary mid-title.
  const [audioTrackIndex, setAudioTrackIndex] = useState<number>();
  // A manual quality caps the negotiation, which makes the server downscale;
  // undefined leaves the source untouched (direct play whenever it is possible).
  const [maxHeight, setMaxHeight] = useState<number>();
  // The file's own height, remembered from a negotiation that did not cap it,
  // so the menu still knows the ceiling while a capped stream is playing.
  const [sourceHeight, setSourceHeight] = useState<number>();
  // Switching tracks reloads the stream; playback resumes where it left off.
  const positionRef = useRef(0);
  const [resumeAt, setResumeAt] = useState<number>();
  // Playback preferences follow the account, so a chosen speed or caption size
  // is the same on the next device.
  const [settings, setSettings] = useState<UserSettings>();
  // For remuxed streams (progressive, no byte ranges) a seek outside the buffer
  // restarts the stream here; the player offsets its timeline to match.
  const [streamStart, setStreamStart] = useState(0);
  // Per-title nudge, kept in memory: automatic timing is corrected on the server.
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  // Live session id, so administrators can see this playback while it runs.
  const sessionRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined); setPlayback(undefined); setThumbnails(undefined); setIntro(undefined); setChapters([]);
    try {
      const capabilities = detectMediaCapabilities();
      // The details page negotiates the default stream ahead of the click; a
      // capped quality or a chosen audio track is a different plan and is asked
      // for here.
      const warmed = maxHeight == null && audioTrackIndex == null ? warmedPlayback(id) : undefined;
      const [{ item: nextItem }, nextPlayback] = await Promise.all([
        api.catalogItem(id),
        warmed ?? api.playback(id, maxHeight ? { ...capabilities, maxHeight } : capabilities, audioTrackIndex),
      ]);
      if (!maxHeight && nextPlayback.plan.video?.height) setSourceHeight(nextPlayback.plan.video.height);
      // A remux cannot seek by byte range, so it opens at the resume point instead.
      const runtime = nextPlayback.durationSeconds ?? nextItem.files?.[0]?.durationSeconds;
      const resume = !fromStart && typeof nextItem.progress === 'number' && nextItem.progress > 0 && nextItem.progress < 1 && runtime ? nextItem.progress * runtime : 0;
      setStreamStart(!nextPlayback.stream.direct && !nextPlayback.stream.hlsUrl && resume > 5 ? Math.floor(resume) : 0);
      setItem(nextItem); setPlayback(nextPlayback);
      // Scrubber previews are optional; a title without a generated sprite just omits them.
      void api.mediaSprites(id).then(({ sprite }) => setThumbnails(sprite)).catch(() => setThumbnails(undefined));
      // Intro markers are optional; a title without one simply hides Skip intro.
      void api.mediaIntro(id).then(({ intro: marker }) => setIntro(marker ?? undefined)).catch(() => setIntro(undefined));
      // Chapters mark the scrub rail when the file carries them.
      void api.mediaChapters(id).then(({ chapters: next }) => setChapters(next)).catch(() => setChapters([]));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Playback could not be started.'); }
  }, [id, audioTrackIndex, maxHeight, fromStart]);
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
  const startPositionSeconds = resumeAt ?? (!fromStart && typeof item.progress === 'number' && item.progress > 0 && item.progress < 1 && duration ? item.progress * duration : undefined);
  const subtitles = (item.subtitles ?? []).map((track) => ({
    id: track.id, label: track.label, srcLang: track.language,
    src: subtitleOffsetMs ? `${track.url}?offsetMs=${subtitleOffsetMs}` : track.url,
  }));
  const ceiling = sourceHeight ?? playback.plan.video?.height;
  const qualities = [
    { id: 'auto', label: ceiling ? `Source (${ceiling}p)` : 'Source' },
    ...QUALITY_RUNGS.filter((height) => ceiling == null || height < ceiling).map((height) => ({ id: String(height), label: `${height}p` })),
  ];
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
  const progressiveTranscode = !offlineSrc && !playback.stream.direct && !playback.stream.hlsUrl;
  const src = offlineSrc ?? playback.stream.hlsUrl
    ?? (progressiveTranscode && streamStart > 0
      ? `${playback.stream.url}${playback.stream.url.includes('?') ? '&' : '?'}start=${streamStart}`
      : playback.stream.url);
  return <main className="flex min-h-screen items-center bg-black"><VideoPlayer
    src={src}
    castSrc={playback.stream.castUrl ? new URL(playback.stream.castUrl, window.location.href).href : undefined}
    title={item.title}
    subtitles={subtitles}
    meta={[item.year, playback.plan.mode === 'direct' ? 'Direct play' : playback.plan.remux ? 'Remux' : 'Optimized'].filter(Boolean).join(' · ')}
    poster={poster}
    posterSrc={cornerPoster}
    thumbnails={thumbnails}
    backHref={detailsHref}
    onBack={(event) => { event.preventDefault(); navigate(detailsHref); }}
    startPositionSeconds={progressiveTranscode ? undefined : startPositionSeconds}
    timelineDurationSeconds={playback.stream.direct ? undefined : duration}
    timeOffsetSeconds={progressiveTranscode ? streamStart : 0}
    onRestartAt={progressiveTranscode ? (seconds) => setStreamStart(Math.max(0, Math.floor(seconds))) : undefined}
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
    chapters={chapters}
    subtitleOffsetMs={subtitleOffsetMs}
    onSubtitleOffsetChange={setSubtitleOffsetMs}
    speedPercent={settings?.playbackSpeedPercent ?? 100}
    onSpeedChange={changeSpeed}
    captionStyle={settings ? { sizePercent: settings.subtitleSizePercent, background: settings.subtitleBackground } : undefined}
    qualities={qualities}
    activeQualityId={maxHeight ? String(maxHeight) : 'auto'}
    onQualityChange={(next) => {
      const height = next === 'auto' ? undefined : Number(next);
      if (height === maxHeight) return;
      // Re-cutting the stream restarts it, so playback resumes where it stopped.
      setResumeAt(positionRef.current); setMaxHeight(height);
    }}
    audioTracks={(playback.audioTracks ?? []).map((track) => ({ id: String(track.index), label: track.label }))}
    activeAudioId={String(playback.plan.audioTrackIndex ?? 0)}
    onAudioChange={(next) => { setResumeAt(positionRef.current); setAudioTrackIndex(Number(next)); }}
    autoPlay
    className="mx-auto max-h-screen max-w-[min(100vw,177.78vh)] rounded-none"
  /></main>;
}
