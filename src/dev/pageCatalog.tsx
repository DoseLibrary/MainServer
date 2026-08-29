import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AuthPage } from '@/pages/AuthPage';
import { LibraryPage, type LibrarySection } from '@/pages/LibraryPage';
import { MediaDetailsPage } from '@/pages/MediaDetailsPage';
import { ServerPickerPage, type ServerPickerItem } from '@/pages/ServerPickerPage';
import trailerSample from './trailer-sample.mp4';

export interface PageCatalogItem {
  id: string;
  name: string;
  description: string;
  source: string;
  preview: ReactNode;
}

const noop = () => undefined;

function poster(seed: string, hue: number) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="600" height="900" fill="hsl(${hue} 60% 22%)"/><circle cx="300" cy="330" r="150" fill="hsl(${hue} 70% 45%)"/><text x="300" y="740" text-anchor="middle" fill="white" font-family="sans-serif" font-size="46">${seed}</text></svg>`)}`;
}
const backdrop = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#0b1220"/><circle cx="1180" cy="300" r="320" fill="#4c1d95"/><circle cx="1360" cy="560" r="200" fill="#0ea5e9"/></svg>')}`;
const brandMark = poster('DOSE', 265);

function landscape(seed: string, hue: number) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="hsl(${hue} 55% 16%)"/><circle cx="470" cy="120" r="150" fill="hsl(${hue} 65% 40%)"/><circle cx="560" cy="250" r="90" fill="hsl(${(hue + 40) % 360} 70% 50%)"/><text x="28" y="330" fill="white" font-family="sans-serif" font-size="30" opacity="0.85">${seed}</text></svg>`)}`;
}
const scenery = {
  arrival: landscape('Arrival', 250),
  dune: landscape('Dune', 30),
  edge: landscape('The Edge', 160),
  atlas: landscape('Atlas', 100),
};

const artwork = {
  arrival: poster('Arrival', 250),
  moonlight: poster('Moonlight', 200),
  dune: poster('Dune', 30),
  edge: poster('Edge', 160),
  signal: poster('Signal', 320),
  atlas: poster('Atlas', 100),
};

// Page previews are rendered raw so they can be mounted full-screen (via the
// /dev/full route) or inside the docs viewport iframe without a bounded wrapper.
function PagePreview({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const navigation = {
  brandLabel: 'DOSE home',
  brand: 'DOSE',
  brandHref: '#home',
  items: [
    { id: 'movies', label: 'Movies', href: '#movies' },
    { id: 'shows', label: 'Shows', href: '#shows' },
  ],
  activeId: 'movies',
  actions: <Button size="sm" variant="outline">Profile</Button>,
} as const;

const librarySections: readonly LibrarySection[] = [
  {
    id: 'continue',
    title: 'Continue watching',
    layout: 'card',
    items: [
      { id: 'arrival', title: 'Arrival', backdropSrc: scenery.arrival, subtitle: '48 min left', progress: 0.62, interaction: { href: '#arrival' } },
      { id: 'edge', title: 'The Edge', backdropSrc: scenery.edge, subtitle: 'S2 · E4', progress: 0.3, interaction: { href: '#edge' } },
      { id: 'dune', title: 'Dune', backdropSrc: scenery.dune, subtitle: '1h 12m left', progress: 0.15, interaction: { href: '#dune' } },
      { id: 'atlas', title: 'Atlas', backdropSrc: scenery.atlas, subtitle: '22 min left', progress: 0.85, interaction: { href: '#atlas' } },
    ],
  },
  {
    id: 'trending',
    title: 'Trending now',
    layout: 'card',
    action: { label: 'See all', href: '#trending' },
    items: [
      { id: 'signal-c', title: 'Signal', backdropSrc: landscape('Signal', 320), subtitle: '2025 · Thriller', badge: 'New', interaction: { href: '#signal' } },
      { id: 'moonlight-c', title: 'Moonlight', backdropSrc: landscape('Moonlight', 200), subtitle: '2016 · Drama', interaction: { href: '#moonlight' } },
      { id: 'unknown-c', title: 'Unknown Title', subtitle: 'Artwork pending', interaction: { href: '#unknown' } },
    ],
  },
  {
    id: 'movies',
    title: 'Movies',
    action: { label: 'See all', href: '#movies' },
    items: [
      { id: 'moonlight', title: 'Moonlight', posterSrc: artwork.moonlight, subtitle: 'Drama', interaction: { href: '#moonlight' } },
      { id: 'signal', title: 'Signal', posterSrc: artwork.signal, subtitle: 'Thriller', interaction: { href: '#signal' } },
      { id: 'atlas', title: 'Atlas', posterSrc: artwork.atlas, subtitle: 'Sci-fi', interaction: { href: '#atlas' } },
      { id: 'arrival-p', title: 'Arrival', posterSrc: artwork.arrival, subtitle: 'Sci-fi', interaction: { href: '#arrival' } },
      { id: 'missing', title: 'Unknown Title', subtitle: 'Artwork pending', interaction: { href: '#unknown' } },
    ],
  },
];

const servers: readonly ServerPickerItem[] = [
  { id: 'living-room', name: 'Living room', address: '192.168.1.20:3001', description: '192 movies · 34 shows', status: 'Online', availability: 'online', href: '#living-room' },
  { id: 'attic', name: 'Attic archive', address: 'attic.local:3001', description: 'Cold storage library', status: 'Limited', availability: 'limited', href: '#attic' },
  { id: 'remote', name: 'Remote cabin', address: 'cabin.example.net:3001', description: 'Currently unreachable', status: 'Offline', availability: 'offline', disabled: true },
];

const cast = [
  { id: 'a', name: 'Amy Adams', role: 'Louise Banks', imageSrc: poster('AA', 340) },
  { id: 'b', name: 'Jeremy Renner', role: 'Ian Donnelly' },
  { id: 'c', name: 'Forest Whitaker', role: 'Colonel Weber', imageSrc: poster('FW', 20) },
  { id: 'd', name: 'Michael Stuhlbarg', role: 'Agent Halpern' },
];

const recommendations = [
  { id: 'signal', title: 'Signal', posterSrc: artwork.signal, subtitle: '2025', interaction: { href: '#signal' } },
  { id: 'atlas', title: 'Atlas', posterSrc: artwork.atlas, subtitle: '2024', interaction: { href: '#atlas' } },
  { id: 'dune', title: 'Dune', posterSrc: artwork.dune, subtitle: '2021', interaction: { href: '#dune' } },
];

const seasons = [
  { id: 's1', name: 'Season 1', episodeCount: 8, overview: 'A quiet town wakes to a signal from the edge of the system.', posterSrc: artwork.edge, interaction: { href: '#s1' } },
  { id: 's2', name: 'Season 2', episodeCount: 10, overview: 'The crew pushes past the boundary and pays for it.', posterSrc: artwork.signal, interaction: { href: '#s2' } },
];

export const pageCatalog: readonly PageCatalogItem[] = [
  {
    id: 'auth-login',
    name: 'Auth — Login',
    description: 'Branded sign-in form over a media backdrop with accessible field errors.',
    source: `<AuthPage
  mode="login"
  brand="DOSE"
  heading="Welcome back"
  description="Sign in to browse your libraries."
  alternateLabel="Need an account? Register"
  alternateHref="#register"
  backdropImageSrc={backdrop}
  onSubmit={(values) => console.log(values)}
/>`,
    preview: <PagePreview><AuthPage mode="login" brand="DOSE" brandImageSrc={brandMark} heading="Welcome back" description="Sign in to browse your libraries." alternateLabel="Need an account? Register" alternateHref="#register" backdropImageSrc={backdrop} backdropImageAlt="Abstract purple backdrop" onSubmit={noop} /></PagePreview>,
  },
  {
    id: 'auth-register',
    name: 'Auth — Register',
    description: 'Register mode adds an email field and shows a form-level error.',
    source: `<AuthPage
  mode="register"
  brand="DOSE"
  heading="Create your account"
  description="Register once on the main server."
  alternateLabel="Already registered? Sign in"
  alternateHref="#login"
  formError="That username is already taken."
  fieldErrors={{ username: 'Already taken' }}
  onSubmit={(values) => console.log(values)}
/>`,
    preview: <PagePreview><AuthPage mode="register" brand="DOSE" brandImageSrc={brandMark} heading="Create your account" description="Register once on the main server." alternateLabel="Already registered? Sign in" alternateHref="#login" backdropImageSrc={backdrop} formError="That username is already taken." fieldErrors={{ username: 'Already taken' }} onSubmit={noop} /></PagePreview>,
  },
  {
    id: 'server-picker-loaded',
    name: 'Server Picker — Loaded',
    description: 'Content servers with address, availability, and selection actions.',
    source: `<ServerPickerPage servers={servers} onSelectServer={(server) => console.log(server)} onConnect={() => {}} />`,
    preview: <PagePreview><ServerPickerPage servers={servers} onSelectServer={noop} onConnect={noop} /></PagePreview>,
  },
  {
    id: 'server-picker-loading',
    name: 'Server Picker — Loading',
    description: 'Skeleton grid preserving the selection layout while servers load.',
    source: `<ServerPickerPage state="loading" />`,
    preview: <PagePreview><ServerPickerPage state="loading" /></PagePreview>,
  },
  {
    id: 'server-picker-empty',
    name: 'Server Picker — Empty',
    description: 'No servers connected yet, with a supplied connect action.',
    source: `<ServerPickerPage servers={[]} onConnect={() => {}} />`,
    preview: <PagePreview><ServerPickerPage servers={[]} onConnect={noop} /></PagePreview>,
  },
  {
    id: 'server-picker-error',
    name: 'Server Picker — Error',
    description: 'Load failure with an assertive alert and retry action.',
    source: `<ServerPickerPage state="error" onRetry={() => {}} />`,
    preview: <PagePreview><ServerPickerPage state="error" onRetry={noop} /></PagePreview>,
  },
  {
    id: 'library-loaded',
    name: 'Library — Home',
    description: 'Netflix-style home: an autoplaying trailer hero over Continue watching and Trending card rows plus a poster row.',
    source: `<LibraryPage
  navigation={navigation}
  title="Home"
  featured={{
    title: 'The Last Horizon',
    eyebrow: 'Featured tonight',
    metadata: <><span>2026</span><span>2h 8m</span><span>PG-13</span></>,
    videoSrc: trailerSrc,
    videoPoster: backdrop,
    primaryAction: { label: 'Play', href: '#play' },
    secondaryAction: { label: 'More info', href: '#info' },
  }}
  sections={librarySections}
/>`,
    preview: <PagePreview><LibraryPage navigation={navigation} title="Home" featured={{ title: 'The Last Horizon', eyebrow: 'Featured tonight', description: 'A responsive featured title leading the library with an autoplaying, muted trailer.', metadata: <><span>2026</span><span>2h 8m</span><span>PG-13</span></>, videoSrc: trailerSample, videoPoster: backdrop, imageAlt: 'Abstract purple and blue landscape', primaryAction: { label: 'Play', href: '#play' }, secondaryAction: { label: 'More information', href: '#info' } }} sections={librarySections} /></PagePreview>,
  },
  {
    id: 'library-loading',
    name: 'Library — Loading',
    description: 'Hero and row skeletons that hold the final layout while loading.',
    source: `<LibraryPage navigation={navigation} title="Movies" state="loading" />`,
    preview: <PagePreview><LibraryPage navigation={navigation} title="Movies" state="loading" /></PagePreview>,
  },
  {
    id: 'library-empty',
    name: 'Library — Empty',
    description: 'Empty library with an explanatory message and connect action.',
    source: `<LibraryPage navigation={navigation} title="Movies" state="empty" emptyAction={{ label: 'Add a server', href: '#servers' }} />`,
    preview: <PagePreview><LibraryPage navigation={navigation} title="Movies" state="empty" emptyAction={{ label: 'Add a server', href: '#servers' }} /></PagePreview>,
  },
  {
    id: 'library-error',
    name: 'Library — Error',
    description: 'Library failure state exposing a supplied retry handler.',
    source: `<LibraryPage navigation={navigation} title="Movies" state="error" onRetry={() => {}} />`,
    preview: <PagePreview><LibraryPage navigation={navigation} title="Movies" state="error" onRetry={noop} /></PagePreview>,
  },
  {
    id: 'media-movie',
    name: 'Media Details — Movie (admin)',
    description: 'Movie detail as a server admin: play, play trailer, mark watched, and a Manage menu (edit metadata).',
    source: `<MediaDetailsPage
  kind="movie"
  navigation={navigation}
  backHref="#library"
  title="Arrival"
  tagline="Why are they here?"
  metadata={<><span>2016</span><span>1h 56m</span><span>PG-13</span></>}
  badges={['4K', 'Sci-fi']}
  overview="A linguist works with the military to communicate with alien lifeforms."
  backdropSrc={backdrop}
  posterSrc={artwork.arrival}
  primaryAction={{ label: 'Play', href: '#play' }}
  secondaryAction={{ label: 'Add to watchlist', onClick: () => {} }}
  onPlayTrailer={() => {}}
  onToggleWatched={() => {}}
  canManage
  onEditMetadata={() => {}}
  adminActions={[
    { id: 'images', label: 'Manage images', onSelect: () => {} },
    { id: 'refresh', label: 'Refresh from TMDB', onSelect: () => {} },
  ]}
  cast={cast}
  recommendations={recommendations}
/>`,
    preview: <PagePreview><MediaDetailsPage kind="movie" navigation={navigation} backHref="#library" title="Arrival" tagline="Why are they here?" metadata={<><span>2016</span><span>1h 56m</span><span>PG-13</span></>} badges={['4K', 'Sci-fi']} overview="A linguist works with the military to communicate with alien lifeforms before global tensions boil over." backdropSrc={backdrop} posterSrc={artwork.arrival} primaryAction={{ label: 'Play', href: '#play' }} secondaryAction={{ label: 'Add to watchlist', onClick: noop }} onPlayTrailer={noop} onToggleWatched={noop} canManage onEditMetadata={noop} adminActions={[{ id: 'images', label: 'Manage images', onSelect: noop }, { id: 'refresh', label: 'Refresh from TMDB', onSelect: noop }]} cast={cast} recommendations={recommendations} /></PagePreview>,
  },
  {
    id: 'media-show',
    name: 'Media Details — Show',
    description: 'Show detail as a regular viewer: no Manage menu, no trailer, already watched.',
    source: `<MediaDetailsPage
  kind="show"
  navigation={navigation}
  backHref="#library"
  title="The Edge"
  metadata={<><span>2024–</span><span>2 seasons</span><span>TV-14</span></>}
  overview="A remote outpost intercepts a signal that should not exist."
  backdropSrc={backdrop}
  posterSrc={artwork.edge}
  primaryAction={{ label: 'Play S1 · E1', href: '#play' }}
  watched
  onToggleWatched={() => {}}
  seasons={seasons}
  recommendations={recommendations}
/>`,
    preview: <PagePreview><MediaDetailsPage kind="show" navigation={navigation} backHref="#library" title="The Edge" metadata={<><span>2024–</span><span>2 seasons</span><span>TV-14</span></>} overview="A remote outpost intercepts a signal that should not exist, and the crew must decide whether to answer it." backdropSrc={backdrop} posterSrc={artwork.edge} primaryAction={{ label: 'Play S1 · E1', href: '#play' }} watched onToggleWatched={noop} seasons={seasons} recommendations={recommendations} /></PagePreview>,
  },
  {
    id: 'media-loading',
    name: 'Media Details — Loading',
    description: 'Detail skeleton holding the poster, metadata, and a row of related art.',
    source: `<MediaDetailsPage kind="movie" navigation={navigation} title="Arrival" state="loading" />`,
    preview: <PagePreview><MediaDetailsPage kind="movie" navigation={navigation} title="Arrival" state="loading" /></PagePreview>,
  },
  {
    id: 'media-error',
    name: 'Media Details — Error',
    description: 'Detail failure state with a supplied retry handler.',
    source: `<MediaDetailsPage kind="movie" navigation={navigation} title="Arrival" state="error" onRetry={() => {}} />`,
    preview: <PagePreview><MediaDetailsPage kind="movie" navigation={navigation} title="Arrival" state="error" onRetry={noop} /></PagePreview>,
  },
];
