import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { api } from '@/lib/api';

/** Only same-origin paths are honoured, so a crafted link cannot bounce a viewer off-site. */
function safeBackHref(candidate: string | null, fallback: string): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  return candidate;
}

export function TrailerWatch() {
  const { id = '' } = useParams(); const navigate = useNavigate();
  const [search] = useSearchParams();
  // Fullscreen from the home hero returns to the home page; from a title's page,
  // back to that title.
  const back = safeBackHref(search.get('back'), `/media/${encodeURIComponent(id)}`);
  return <main className="flex min-h-screen items-center bg-black"><VideoPlayer src={api.trailerUrl(id)} title="Trailer" backHref={back} onBack={(event) => { event.preventDefault(); navigate(back); }} autoPlay className="mx-auto max-h-screen max-w-[min(100vw,177.78vh)] rounded-none" /></main>;
}
