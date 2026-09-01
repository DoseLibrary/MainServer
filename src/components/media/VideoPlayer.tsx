import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Subtitles,
  RotateCcw,
  RotateCw,
  Loader2,
  ArrowLeft,
  SkipForward,
  Cast,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { castMedia, subscribeToCast, type CastState } from '@/lib/google-cast';

export interface PlayerTrack {
  id: string;
  label: string;
  /** BCP-47 language tag, such as `en` or `sv`. */
  srcLang?: string;
  src: string;
  default?: boolean;
}

export interface PlayerOption {
  id: string;
  label: string;
}

export interface PlayerThumbnails {
  /** Sprite sheet URL laid out left-to-right, top-to-bottom. */
  src: string;
  columns: number;
  rows: number;
  /** Seconds of video represented by each tile. */
  interval: number;
  /** Tile size in the sprite, in pixels. */
  tileWidth: number;
  tileHeight: number;
}

export interface VideoPlayerProps {
  src: string;
  /** Public, short-lived stream URL loaded by a Chromecast receiver. */
  castSrc?: string;
  castContentType?: string;
  title?: string;
  /** Full-frame poster shown before playback (the `<video>` poster). */
  poster?: string;
  /** Small poster shown in the top-right info card. */
  posterSrc?: string;
  /** Secondary line for the info card, such as `2010 · 2h 28m · 4K`. */
  meta?: ReactNode;
  /** Caption/subtitle sidecar tracks. */
  subtitles?: readonly PlayerTrack[];
  /** Selectable quality rungs; ties into server transcode negotiation later. */
  qualities?: readonly PlayerOption[];
  activeQualityId?: string;
  onQualityChange?: (id: string) => void;
  /** Selectable audio tracks; per-track direct-stream picks the compatible one. */
  audioTracks?: readonly PlayerOption[];
  activeAudioId?: string;
  onAudioChange?: (id: string) => void;
  /** Storyboard sprite for scrubber hover previews. */
  thumbnails?: PlayerThumbnails;
  /** Back control shown top-left to exit playback. */
  backHref?: string;
  onBack?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Resume position, applied once when metadata loads. */
  startPositionSeconds?: number;
  /** Fired periodically with the current position for progress persistence. */
  onProgress?: (positionSeconds: number, durationSeconds: number) => void;
  /** `cancelled` is true when the viewer stopped the auto-advance countdown. */
  onEnded?: (info: { autoAdvanceCancelled: boolean }) => void;
  /** Shown in the closing seconds so the next episode can be skipped to or stopped. */
  nextUp?: { title: string; subtitle?: string; posterSrc?: string };
  /** Seconds before the end at which the next-episode card appears. */
  autoAdvanceSeconds?: number;
  /** Playback rate as a percentage of normal speed, remembered per account. */
  speedPercent?: number;
  onSpeedChange?: (percent: number) => void;
  /** Caption presentation, remembered per account. */
  captionStyle?: { sizePercent: number; background: 'none' | 'shadow' | 'box' };
  /** Viewer nudge for captions that still run early or late, in milliseconds. */
  subtitleOffsetMs?: number;
  onSubtitleOffsetChange?: (offsetMs: number) => void;
  /** Authoritative runtime for streams whose container reports none (transcodes). */
  timelineDurationSeconds?: number;
  /** Where in the timeline the current stream begins (after a seek-restart). */
  timeOffsetSeconds?: number;
  /** Asked to restart the stream at a timeline position the buffer cannot reach. */
  onRestartAt?: (seconds: number) => void;
  /** When set, a "Next episode" control is shown to skip to the next item. */
  onNext?: () => void;
  /** Detected intro segment; a "Skip intro" button appears while inside it. */
  intro?: { startSeconds: number; endSeconds: number };
  /** Chapter markers from the file: ticks on the rail, names in the hover preview. */
  chapters?: readonly { title: string; startSeconds: number }[];
  autoPlay?: boolean;
  className?: string;
}

let nativeHlsSupport: boolean | undefined;
/** Safari (and iOS WebViews) play HLS natively; everyone else needs hls.js. */
function supportsNativeHls(): boolean {
  if (nativeHlsSupport === undefined) {
    nativeHlsSupport = typeof document !== 'undefined'
      && document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '';
  }
  return nativeHlsSupport;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {children}
    </button>
  );
}

type MenuKind = 'subtitles' | 'settings' | null;

export function VideoPlayer({
  src,
  castSrc,
  castContentType = 'video/mp4',
  title,
  poster,
  posterSrc,
  meta,
  subtitles = [],
  qualities = [],
  activeQualityId,
  onQualityChange,
  audioTracks = [],
  activeAudioId,
  onAudioChange,
  thumbnails,
  backHref,
  onBack,
  startPositionSeconds,
  onProgress,
  onEnded,
  onNext,
  nextUp,
  autoAdvanceSeconds = 15,
  chapters = [],
  speedPercent = 100,
  onSpeedChange,
  captionStyle,
  subtitleOffsetMs = 0,
  onSubtitleOffsetChange,
  timelineDurationSeconds,
  timeOffsetSeconds = 0,
  onRestartAt,
  intro,
  autoPlay = false,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  // Keep the latest callbacks in refs so the media-event listeners never resubscribe.
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  // Everything user-facing speaks timeline seconds; the element speaks stream
  // seconds. These refs keep media-event handlers on the current mapping.
  const offsetRef = useRef(timeOffsetSeconds);
  const timelineRef = useRef(timelineDurationSeconds);
  const hlsRef = useRef<{ destroy(): void; levels: Array<{ height?: number; name?: string }>; nextLevel: number } | null>(null);
  const [hlsLevels, setHlsLevels] = useState<Array<{ id: string; label: string }>>([]);
  const [hlsQuality, setHlsQuality] = useState('auto');
  // Cancelling the countdown must also stop the advance that would fire on 'ended'.
  const autoAdvanceCancelled = useRef(false);
  const lastReportRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  useEffect(() => { onProgressRef.current = onProgress; onEndedRef.current = onEnded; offsetRef.current = timeOffsetSeconds; timelineRef.current = timelineDurationSeconds; });
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speedPercent / 100;
  }, [speedPercent, src]);

  const isHlsSource = src.includes('.m3u8');
  const nativeHls = isHlsSource && supportsNativeHls();

  useEffect(() => {
    if (!isHlsSource) return;
    const video = videoRef.current;
    if (!video || video.canPlayType('application/vnd.apple.mpegurl')) return; // Safari plays it natively
    let cancelled = false;
    let instance: { destroy(): void } | undefined;
    // hls.js is only paid for when a transcode actually streams HLS.
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const hls = new Hls({ maxBufferLength: 30 });
      instance = hls;
      hlsRef.current = hls as unknown as typeof hlsRef.current;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsLevels(hls.levels.map((level, index) => ({ id: String(index), label: level.name ?? (level.height ? `${level.height}p` : `Level ${index + 1}`) })));
      });
    }).catch(() => { /* without hls.js the browser may still manage natively */ });
    return () => { cancelled = true; instance?.destroy(); hlsRef.current = null; setHlsLevels([]); setHlsQuality('auto'); };
  }, [src, isHlsSource]);

  const selectHlsQuality = useCallback((id: string) => {
    setHlsQuality(id);
    if (hlsRef.current) hlsRef.current.nextLevel = id === 'auto' ? -1 : Number(id);
  }, []);

  // The ladder from the stream wins over caller-provided quality options.
  const qualityOptions = hlsLevels.length > 0 ? [{ id: 'auto', label: 'Auto' }, ...hlsLevels] : qualities;
  const activeQuality = hlsLevels.length > 0 ? hlsQuality : activeQualityId;
  const selectQuality = hlsLevels.length > 0 ? selectHlsQuality : onQualityChange;

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [elementDuration, setDuration] = useState(0);
  // Transcoded containers report no runtime; the caller's figure is authoritative.
  const duration = timelineDurationSeconds ?? elementDuration;
  const [current, setCurrent] = useState(0);
  // Remembering which source was cancelled means a new episode starts fresh
  // without an effect that resets state on every source change.
  const [cancelledSrc, setCancelledSrc] = useState<string>();
  const countdownCancelled = cancelledSrc === src;
  useEffect(() => { autoAdvanceCancelled.current = countdownCancelled; }, [countdownCancelled]);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [openMenu, setOpenMenu] = useState<MenuKind>(null);
  const [activeCcId, setActiveCcId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ time: number; left: number } | null>(null);
  const [castState, setCastState] = useState<CastState>('unavailable');

  useEffect(() => subscribeToCast(setCastState), []);

  const startCasting = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !castSrc) return;
    try {
      await castMedia({ src: castSrc, contentType: castContentType, title, poster, currentTime: video.currentTime });
      video.pause();
    } catch { /* The Cast chooser may be dismissed; keep local playback unchanged. */ }
  }, [castContentType, castSrc, poster, title]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 2600);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = time - offsetRef.current;
    if (onRestartAt) {
      // A restartable stream can only reach what it has buffered; anything else
      // is a fresh stream starting at the requested position.
      const len = video.buffered.length;
      const bufferedEnd = len ? video.buffered.end(len - 1) : 0;
      if (target < 0 || target > bufferedEnd + 0.5) { onRestartAt(Math.max(0, time)); return; }
    }
    video.currentTime = Math.max(0, target);
  }, [onRestartAt]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const limit = timelineRef.current ?? (Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER);
    seekTo(Math.min(Math.max(0, offsetRef.current + video.currentTime + delta), limit));
  }, [seekTo]);

  const onScrubHover = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rail = scrubRef.current;
    if (!rail || !Number.isFinite(duration) || duration <= 0) return;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    // Keep the floating preview inside the rail, clamping the ends.
    const halfWidth = thumbnails ? thumbnails.tileWidth / 2 : 28;
    const left = Math.min(rect.width - halfWidth, Math.max(halfWidth, ratio * rect.width));
    setHover({ time: ratio * duration, left });
  }, [duration, thumbnails]);

  const changeVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Math.min(1, Math.max(0, value));
    video.volume = v;
    video.muted = v === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const selectCaptions = useCallback((id: string | null) => {
    const video = videoRef.current;
    if (video) {
      Array.from(video.textTracks).forEach((track, i) => {
        track.mode = subtitles[i]?.id === id ? 'showing' : 'disabled';
      });
    }
    setActiveCcId(id);
    setOpenMenu(null);
  }, [subtitles, setOpenMenu]);

  // Sync UI state from the media element's own events (no setState-in-effect churn).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onPlay = () => { setPlaying(true); showControls(); };
    const onPause = () => { setPlaying(false); setControlsVisible(true); };
    const onTime = () => setCurrent(offsetRef.current + video.currentTime);
    const onDuration = () => setDuration(timelineRef.current ?? (Number.isFinite(video.duration) ? video.duration : 0));
    const onProgress = () => {
      const len = video.buffered.length;
      setBuffered(len ? offsetRef.current + video.buffered.end(len - 1) : 0);
    };
    const onVolume = () => { setVolume(video.volume); setMuted(video.muted); };
    const onWaiting = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('progress', onProgress);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [showControls]);

  // Resume position and periodic progress persistence, driven by media events.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const report = () => {
      const dur = timelineRef.current ?? (video.duration || 0);
      const position = offsetRef.current + video.currentTime;
      if (!Number.isFinite(position) || dur <= 0) return;
      lastReportRef.current = position;
      onProgressRef.current?.(position, dur);
    };
    const onLoaded = () => {
      if (resumeAppliedRef.current) return;
      resumeAppliedRef.current = true;
      if (offsetRef.current > 0) return; // an offset stream already starts at the resume point
      const dur = timelineRef.current ?? (video.duration || 0);
      // Only resume when there is meaningful runtime left; ignore near-complete positions.
      if (startPositionSeconds && startPositionSeconds > 5 && dur > 0 && startPositionSeconds < dur - 5) {
        video.currentTime = startPositionSeconds;
      }
    };
    const onTime = () => {
      if (Math.abs(offsetRef.current + video.currentTime - lastReportRef.current) >= 10) report();
    };
    const onEnded = () => { report(); onEndedRef.current?.({ autoAdvanceCancelled: autoAdvanceCancelled.current }); };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('pause', report);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('pause', report);
      video.removeEventListener('ended', onEnded);
      report();
    };
  }, [startPositionSeconds]);

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case ' ':
      case 'k':
        event.preventDefault();
        togglePlay();
        break;
      case 'ArrowLeft':
      case 'j':
        event.preventDefault();
        seekBy(-10);
        break;
      case 'ArrowRight':
      case 'l':
        event.preventDefault();
        seekBy(10);
        break;
      case 'ArrowUp':
        event.preventDefault();
        changeVolume((videoRef.current?.volume ?? 0) + 0.1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        changeVolume((videoRef.current?.volume ?? 0) - 0.1);
        break;
      case 'm':
        toggleMute();
        break;
      case 'f':
        toggleFullscreen();
        break;
      default:
        return;
    }
    showControls();
  };

  const chapterAt = (time: number) => {
    let name: string | undefined;
    for (const chapter of chapters) {
      if (chapter.startSeconds <= time) name = chapter.title;
      else break;
    }
    return name;
  };
  const progressPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const captionCss = captionStyle && (captionStyle.sizePercent !== 100 || captionStyle.background !== 'shadow')
    ? `#${CSS.escape(menuId)}-stage video::cue{font-size:${captionStyle.sizePercent}%;`
      + (captionStyle.background === 'box' ? 'background-color:rgba(0,0,0,0.75);text-shadow:none;'
        : captionStyle.background === 'none' ? 'background-color:transparent;text-shadow:none;'
          : 'background-color:transparent;text-shadow:0 2px 4px rgba(0,0,0,0.9);')
      + '}'
    : undefined;
  const hasSettings = qualityOptions.length > 0 || audioTracks.length > 0 || Boolean(onSpeedChange);

  let spriteStyle: React.CSSProperties | null = null;
  if (hover && thumbnails) {
    const tileCount = thumbnails.columns * thumbnails.rows;
    const index = Math.min(tileCount - 1, Math.max(0, Math.floor(hover.time / thumbnails.interval)));
    const col = index % thumbnails.columns;
    const row = Math.floor(index / thumbnails.columns);
    spriteStyle = {
      width: thumbnails.tileWidth,
      height: thumbnails.tileHeight,
      backgroundImage: `url(${thumbnails.src})`,
      backgroundPosition: `-${col * thumbnails.tileWidth}px -${row * thumbnails.tileHeight}px`,
      backgroundSize: `${thumbnails.columns * thumbnails.tileWidth}px ${thumbnails.rows * thumbnails.tileHeight}px`,
    };
  }

  return (
    <div
      ref={containerRef}
      id={`${menuId}-stage`}
      className={cn(
        'group relative aspect-video w-full select-none overflow-hidden rounded-lg bg-black text-white outline-none',
        !controlsVisible && playing && 'cursor-none',
        className,
      )}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={showControls}
      onMouseLeave={() => { if (playing) setControlsVisible(false); }}
    >
      {captionCss && <style>{captionCss}</style>}
      <video
        ref={videoRef}
        src={isHlsSource && !nativeHls ? undefined : src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        onClick={togglePlay}
        className="h-full w-full bg-black"
      >
        {subtitles.map((track) => (
          <track key={track.id} kind="subtitles" src={track.src} srcLang={track.srcLang} label={track.label} default={track.default} />
        ))}
      </video>

      {(backHref || onBack) && (
        <div
          className={cn(
            'absolute left-3 top-3 z-20 transition-opacity duration-200',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {backHref ? (
            <a
              href={backHref}
              onClick={onBack}
              aria-label="Exit playback"
              title="Exit playback"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/90 ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ArrowLeft className="h-5 w-5" />
            </a>
          ) : (
            <button
              type="button"
              onClick={onBack}
              aria-label="Exit playback"
              title="Exit playback"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/90 ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {(title || meta || posterSrc) && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 flex justify-end bg-gradient-to-b from-black/70 to-transparent p-3 pb-10 transition-opacity duration-200',
            controlsVisible ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="flex max-w-[70%] items-center gap-3 text-right">
            <div className="min-w-0">
              {title && <div className="truncate text-sm font-semibold text-white drop-shadow sm:text-base">{title}</div>}
              {meta && <div className="mt-0.5 truncate text-xs text-white/70">{meta}</div>}
            </div>
            {posterSrc && (
              <img src={posterSrc} alt="" className="h-16 w-11 shrink-0 rounded object-cover shadow-lg ring-1 ring-white/15" />
            )}
          </div>
        </div>
      )}

      {intro && current >= intro.startSeconds + 1 && current < intro.endSeconds - 1 && (
        <button
          type="button"
          onClick={() => seekTo(intro.endSeconds)}
          className="absolute bottom-24 right-6 z-20 rounded-md border border-white/30 bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          Skip intro
        </button>
      )}

      {nextUp && onNext && !countdownCancelled && duration > 0 && duration - current <= autoAdvanceSeconds && duration - current > 0 && (
        <div className="absolute bottom-24 right-6 z-20 w-72 rounded-lg border border-white/20 bg-black/80 p-4 text-white backdrop-blur-sm">
          <p className="text-xs uppercase tracking-widest text-white/60">Up next</p>
          <div className="mt-2 flex items-center gap-3">
            {nextUp.posterSrc && <img src={nextUp.posterSrc} alt="" className="h-16 w-11 shrink-0 rounded object-cover" />}
            <div className="min-w-0">
              <p className="truncate font-semibold">{nextUp.title}</p>
              {nextUp.subtitle && <p className="truncate text-xs text-white/60">{nextUp.subtitle}</p>}
            </div>
          </div>
          <p className="mt-3 text-sm text-white/70">Playing in {Math.max(0, Math.ceil(duration - current))}s</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onNext}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-black transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              Play now
            </button>
            <button type="button" onClick={() => setCancelledSrc(src)}
              className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {waiting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 aria-label="Buffering" className="h-12 w-12 animate-spin text-white/90" />
        </div>
      )}

      {!playing && !waiting && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30 focus-visible:outline-none"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 ring-1 ring-white/25 backdrop-blur-sm transition-transform hover:scale-105">
            <Play className="h-8 w-8 translate-x-0.5 fill-current text-white" />
          </span>
        </button>
      )}

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200',
          controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div
          ref={scrubRef}
          className="group/scrub relative flex h-5 cursor-pointer items-center"
          onMouseMove={onScrubHover}
          onMouseLeave={() => setHover(null)}
        >
          {hover && (
            <div className="pointer-events-none absolute bottom-full z-20 mb-3 flex flex-col items-center" style={{ left: hover.left, transform: 'translateX(-50%)' }}>
              {spriteStyle && (
                <div className="overflow-hidden rounded-lg bg-black shadow-2xl ring-1 ring-white/25" style={{ width: thumbnails?.tileWidth, height: thumbnails?.tileHeight }}>
                  <div style={spriteStyle} />
                </div>
              )}
              <span className="mt-1.5 flex max-w-56 items-baseline gap-1.5 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-medium text-white ring-1 ring-white/10">
                {chapterAt(hover.time) && <span className="truncate">{chapterAt(hover.time)}</span>}
                <span className="tabular-nums text-white/80">{formatTime(hover.time)}</span>
              </span>
            </div>
          )}

          <input
            type="range"
            min={0}
            max={duration || 0}
            step="any"
            value={current}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Seek"
            className="absolute inset-0 z-10 h-5 w-full cursor-pointer opacity-0"
          />
          <div className="relative h-1 w-full rounded-full bg-white/15 transition-[height] duration-150 group-hover/scrub:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progressPct}%` }} />
            {duration > 0 && chapters.map((chapter) => (
              chapter.startSeconds > 0 && chapter.startSeconds < duration
                ? <div key={chapter.startSeconds} aria-hidden="true" className="absolute inset-y-0 w-px bg-black/50" style={{ left: `${(chapter.startSeconds / duration) * 100}%` }} />
                : null
            ))}
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-sm transition-opacity duration-150 group-hover/scrub:opacity-100"
              style={{ left: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-1">
          <ControlButton label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
          </ControlButton>
          <ControlButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
            <RotateCcw className="h-5 w-5" />
          </ControlButton>
          <ControlButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
            <RotateCw className="h-5 w-5" />
          </ControlButton>
          {onNext && (
            <ControlButton label="Next episode" onClick={onNext}>
              <SkipForward className="h-5 w-5" />
            </ControlButton>
          )}

          <div className="group/vol flex items-center">
            <ControlButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
              <VolumeIcon className="h-5 w-5" />
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-0 cursor-pointer opacity-0 transition-all duration-200 group-hover/vol:w-16 group-hover/vol:opacity-100 focus-visible:w-16 focus-visible:opacity-100 accent-white"
            />
          </div>

          <div className="px-2 text-xs tabular-nums text-white/80">
            {formatTime(current)} <span className="text-white/40">/</span> {formatTime(duration)}
          </div>

          <div className="ml-auto flex items-center gap-1">
            {castSrc && castState !== 'unavailable' && (
              <ControlButton label={castState === 'connected' ? 'Casting' : 'Cast'} onClick={() => { void startCasting(); }}>
                <Cast className={cn('h-5 w-5', castState === 'connected' && 'fill-current')} />
              </ControlButton>
            )}
            {subtitles.length > 0 && (
              <div className="relative">
                <ControlButton label="Subtitles" onClick={() => setOpenMenu((m) => (m === 'subtitles' ? null : 'subtitles'))}>
                  <Subtitles className={cn('h-5 w-5', activeCcId && 'text-white')} />
                </ControlButton>
                {openMenu === 'subtitles' && (
                  <div id={`${menuId}-cc`} role="menu" className="absolute bottom-11 right-0 min-w-40 rounded-md border border-white/10 bg-black/95 p-1 text-sm shadow-xl">
                    <MenuItem selected={activeCcId === null} onClick={() => selectCaptions(null)}>Off</MenuItem>
                    {subtitles.map((t) => (
                      <MenuItem key={t.id} selected={activeCcId === t.id} onClick={() => selectCaptions(t.id)}>{t.label}</MenuItem>
                    ))}
                    {onSubtitleOffsetChange && activeCcId && (
                      <div className="mt-1 border-t border-white/10 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-white/50">Delay</div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <button type="button" aria-label="Subtitles earlier" onClick={() => onSubtitleOffsetChange(subtitleOffsetMs - 250)}
                            className="h-7 w-7 rounded border border-white/20 text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">−</button>
                          <span className="min-w-16 text-center tabular-nums">{(subtitleOffsetMs / 1000).toFixed(2)}s</span>
                          <button type="button" aria-label="Subtitles later" onClick={() => onSubtitleOffsetChange(subtitleOffsetMs + 250)}
                            className="h-7 w-7 rounded border border-white/20 text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">+</button>
                          {subtitleOffsetMs !== 0 && (
                            <button type="button" onClick={() => onSubtitleOffsetChange(0)}
                              className="ml-auto text-xs text-white/70 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">Reset</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {hasSettings && (
              <div className="relative">
                <ControlButton label="Settings" onClick={() => setOpenMenu((m) => (m === 'settings' ? null : 'settings'))}>
                  <Settings className="h-5 w-5" />
                </ControlButton>
                {openMenu === 'settings' && (
                  <div id={`${menuId}-settings`} role="menu" className="absolute bottom-11 right-0 min-w-44 rounded-md border border-white/10 bg-black/95 p-1 text-sm shadow-xl">
                    {onSpeedChange && (
                      <>
                        <div className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-white/50">Speed</div>
                        {[50, 75, 100, 125, 150, 200].map((percent) => (
                          <MenuItem key={percent} selected={speedPercent === percent} onClick={() => onSpeedChange(percent)}>
                            {percent === 100 ? 'Normal' : `${percent / 100}\u00d7`}
                          </MenuItem>
                        ))}
                      </>
                    )}
                    {qualityOptions.length > 0 && (
                      <>
                        <div className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-white/50">Quality</div>
                        {qualityOptions.map((q) => (
                          <MenuItem key={q.id} selected={q.id === activeQuality} onClick={() => { selectQuality?.(q.id); setOpenMenu(null); }}>{q.label}</MenuItem>
                        ))}
                      </>
                    )}
                    {audioTracks.length > 0 && (
                      <>
                        <div className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-white/50">Audio</div>
                        {audioTracks.map((a) => (
                          <MenuItem key={a.id} selected={a.id === activeAudioId} onClick={() => { onAudioChange?.(a.id); setOpenMenu(null); }}>{a.label}</MenuItem>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <ControlButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-4 rounded px-3 py-1.5 text-left transition-colors hover:bg-white/10',
        selected ? 'font-semibold text-white' : 'text-white/70',
      )}
    >
      {children}
      {selected && <span aria-hidden="true" className="text-white">✓</span>}
    </button>
  );
}
