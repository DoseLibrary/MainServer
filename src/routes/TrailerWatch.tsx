import { useParams, useNavigate } from 'react-router-dom';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import { api } from '@/lib/api';

export function TrailerWatch() {
  const { id = '' } = useParams(); const navigate = useNavigate();
  const back = `/media/${encodeURIComponent(id)}`;
  return <main className="flex min-h-screen items-center bg-black"><VideoPlayer src={api.trailerUrl(id)} title="Trailer" backHref={back} onBack={(event) => { event.preventDefault(); navigate(back); }} autoPlay className="mx-auto max-h-screen max-w-[min(100vw,177.78vh)] rounded-none" /></main>;
}
