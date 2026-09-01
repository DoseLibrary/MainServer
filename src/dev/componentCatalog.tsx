import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Carousel } from '@/components/media/Carousel';
import { Hero } from '@/components/media/Hero';
import { MediaCard } from '@/components/media/MediaCard';
import { Navbar } from '@/components/media/Navbar';
import { Poster } from '@/components/media/Poster';
import { SearchDropdown, type SearchResultGroup } from '@/components/media/SearchDropdown';
import { VideoPlayer } from '@/components/media/VideoPlayer';
import trailerSample from './trailer-sample.mp4';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle, ModalTrigger } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { SwitchPreview } from '@/dev/SwitchPreview';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

export interface ComponentCatalogItem {
  id: string;
  name: string;
  description: string;
  category: 'UI' | 'Media';
  preview: React.ReactNode;
  source: string;
}

const artwork = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="600" height="900" fill="#312e81"/><circle cx="300" cy="350" r="170" fill="#7c3aed"/><text x="300" y="720" text-anchor="middle" fill="white" font-family="sans-serif" font-size="54">DOSE</text></svg>')}`;
const backdrop = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#172554"/><circle cx="1150" cy="340" r="300" fill="#6d28d9"/><circle cx="1320" cy="560" r="180" fill="#0ea5e9"/></svg>')}`;
const posters = [{ id: 'arrival', title: 'Arrival', subtitle: 'Science fiction', src: artwork }, { id: 'moonlight', title: 'Moonlight', subtitle: 'Drama', src: artwork }, { id: 'fallback', title: 'Missing artwork', subtitle: 'Fallback state' }];

const searchGroups: readonly SearchResultGroup[] = [
  {
    id: 'movies',
    label: 'Movies',
    items: [
      { id: 'inception', title: 'Inception', year: 2010, meta: '2h 28m', posterSrc: artwork, badge: '4K', href: '#inception' },
      { id: 'arrival', title: 'Arrival', year: 2016, meta: '1h 56m', posterSrc: artwork, href: '#arrival' },
      { id: 'nope', title: 'Nope', year: 2022, meta: '2h 10m', badge: 'HDR', href: '#nope' },
    ],
  },
  {
    id: 'shows',
    label: 'Shows',
    items: [
      { id: 'severance', title: 'Severance', year: 2022, meta: '2 seasons', posterSrc: artwork, badge: '4K', href: '#severance' },
      { id: 'dark', title: 'Dark', year: 2017, meta: '3 seasons', posterSrc: artwork, href: '#dark' },
    ],
  },
];

function SearchPreview() {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const groups = trimmed
    ? searchGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => item.title.toLowerCase().includes(trimmed)) }))
        .filter((group) => group.items.length > 0)
    : searchGroups;
  return (
    <div className="min-h-[26rem] w-full max-w-md">
      <SearchDropdown query={query} onQueryChange={setQuery} groups={groups} />
    </div>
  );
}

const SPRITE_COLS = 5;
const SPRITE_ROWS = 4;
const SPRITE_TILE_W = 160;
const SPRITE_TILE_H = 90;
const previewSprite = (() => {
  let tiles = '';
  for (let i = 0; i < SPRITE_COLS * SPRITE_ROWS; i += 1) {
    const x = (i % SPRITE_COLS) * SPRITE_TILE_W;
    const y = Math.floor(i / SPRITE_COLS) * SPRITE_TILE_H;
    const hue = Math.round((i * 300) / (SPRITE_COLS * SPRITE_ROWS)) + 240;
    tiles += `<rect x="${x}" y="${y}" width="${SPRITE_TILE_W}" height="${SPRITE_TILE_H}" fill="hsl(${hue} 55% 28%)"/><text x="${x + SPRITE_TILE_W / 2}" y="${y + SPRITE_TILE_H / 2}" fill="white" font-family="sans-serif" font-size="22" text-anchor="middle" dominant-baseline="middle">${i + 1}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SPRITE_COLS * SPRITE_TILE_W}" height="${SPRITE_ROWS * SPRITE_TILE_H}">${tiles}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
})();

const sampleVtt = `data:text/vtt,${encodeURIComponent('WEBVTT\n\n00:00.000 --> 00:04.000\nSample caption track.\n')}`;

function VideoPreview() {
  const [quality, setQuality] = useState('auto');
  const [audio, setAudio] = useState('en');
  return (
    <div className="w-full max-w-2xl">
      <VideoPlayer
        src={trailerSample}
        title="Sample trailer"
        posterSrc={artwork}
        meta="2026 · 1h 52m · 4K"
        subtitles={[
          { id: 'en', label: 'English', srcLang: 'en', src: sampleVtt, default: true },
          { id: 'sv', label: 'Svenska', srcLang: 'sv', src: sampleVtt },
        ]}
        thumbnails={{ src: previewSprite, columns: SPRITE_COLS, rows: SPRITE_ROWS, interval: 2, tileWidth: SPRITE_TILE_W, tileHeight: SPRITE_TILE_H }}
        qualities={[
          { id: 'auto', label: 'Auto' },
          { id: '2160', label: '4K · Direct play' },
          { id: '1080', label: '1080p · Transcode' },
          { id: '720', label: '720p · Transcode' },
        ]}
        activeQualityId={quality}
        onQualityChange={setQuality}
        audioTracks={[
          { id: 'en', label: 'English 5.1' },
          { id: 'sv', label: 'Svenska · Stereo' },
        ]}
        activeAudioId={audio}
        onAudioChange={setAudio}
      />
    </div>
  );
}

function ToastPreview() {
  const { toast } = useToast();
  return <><Button onClick={() => toast({ title: 'Library updated', description: '12 new titles were found.' })}>Show toast</Button><Button variant="destructive" onClick={() => toast({ title: 'Connection failed', description: 'Try again in a moment.', variant: 'destructive' })}>Show error</Button></>;
}

export const componentCatalog: readonly ComponentCatalogItem[] = [
  { id: 'button', name: 'Button', category: 'UI', description: 'Triggers an action with clear visual priority and state.', source: `<>
<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>
<Button disabled>Disabled</Button>
</>`, preview: <><Button>Default</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Destructive</Button><Button disabled>Disabled</Button></> },
  { id: 'input', name: 'Input', category: 'UI', description: 'A labelled text field with optional validation feedback.', source: `<>
  <div className="w-72"><Input label="Search" placeholder="Movie or show" /></div>
  <div className="w-72"><Input label="Username" defaultValue="dose" error="Already taken" /></div>
</>`, preview: <><div className="w-72"><Input label="Search" placeholder="Movie or show" /></div><div className="w-72"><Input label="Username" defaultValue="dose" error="Already taken" /></div></> },
  { id: 'switch', name: 'Switch', category: 'UI', description: 'Turns a setting on or off, applying immediately.', source: `<Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enabled" />`, preview: <SwitchPreview /> },
  { id: 'spinner', name: 'Spinner', category: 'UI', description: 'Communicates an indeterminate loading state.', source: `<Spinner />`, preview: <Spinner /> },
  { id: 'skeleton', name: 'Skeleton', category: 'UI', description: 'Reserves layout space while content is loading.', source: `<div className="space-y-2">
  <Skeleton className="h-24 w-44" />
  <Skeleton className="h-4 w-44" />
  <Skeleton className="h-4 w-32" />
</div>`, preview: <div className="space-y-2"><Skeleton className="h-24 w-44" /><Skeleton className="h-4 w-44" /><Skeleton className="h-4 w-32" /></div> },
  { id: 'card', name: 'Card', category: 'UI', description: 'Groups related content and actions in a bordered surface.', source: `<Card className="w-80">
  <CardHeader><CardTitle>Content server</CardTitle><CardDescription>Living room library</CardDescription></CardHeader>
  <CardContent>192 movies · 34 shows</CardContent>
  <CardFooter><Button size="sm">Open</Button></CardFooter>
</Card>`, preview: <Card className="w-80"><CardHeader><CardTitle>Content server</CardTitle><CardDescription>Living room library</CardDescription></CardHeader><CardContent>192 movies · 34 shows</CardContent><CardFooter><Button size="sm">Open</Button></CardFooter></Card> },
  { id: 'modal', name: 'Modal', category: 'UI', description: 'Focuses attention on a short task in an accessible overlay.', source: `<Modal>
  <ModalTrigger asChild><Button variant="outline">Open modal</Button></ModalTrigger>
  <ModalContent>
    <ModalHeader><ModalTitle>Connect a server</ModalTitle><ModalDescription>Enter the code shown by your content server.</ModalDescription></ModalHeader>
    <Input label="Connection code" placeholder="DOSE-1234" />
    <ModalFooter><Button>Connect</Button></ModalFooter>
  </ModalContent>
</Modal>`, preview: <Modal><ModalTrigger asChild><Button variant="outline">Open modal</Button></ModalTrigger><ModalContent><ModalHeader><ModalTitle>Connect a server</ModalTitle><ModalDescription>Enter the code shown by your content server.</ModalDescription></ModalHeader><Input label="Connection code" placeholder="DOSE-1234" /><ModalFooter><Button>Connect</Button></ModalFooter></ModalContent></Modal> },
  { id: 'toast', name: 'Toast', category: 'UI', description: 'Briefly reports success or failure without interrupting work.', source: `function ToastPreview() {
  const { toast } = useToast();
  return <>
    <Button onClick={() => toast({ title: 'Library updated', description: '12 new titles were found.' })}>Show toast</Button>
    <Button variant="destructive" onClick={() => toast({ title: 'Connection failed', description: 'Try again in a moment.', variant: 'destructive' })}>Show error</Button>
  </>;
}

<ToastPreview />`, preview: <ToastPreview /> },
  { id: 'dropdown-menu', name: 'Dropdown Menu', category: 'UI', description: 'Presents a compact list of contextual actions.', source: `<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Open menu</span></Button></DropdownMenuTrigger>
  <DropdownMenuContent><DropdownMenuLabel>Library</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem>Scan now</DropdownMenuItem><DropdownMenuItem>Settings</DropdownMenuItem></DropdownMenuContent>
</DropdownMenu>`, preview: <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Open menu</span></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuLabel>Library</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem>Scan now</DropdownMenuItem><DropdownMenuItem>Settings</DropdownMenuItem></DropdownMenuContent></DropdownMenu> },
  { id: 'avatar', name: 'Avatar', category: 'UI', description: 'Displays a person or service identity with a text fallback.', source: `<>
  <Avatar alt="Filip Villain" />
  <Avatar alt="DOSE" fallback="D" />
</>`, preview: <><Avatar alt="Filip Villain" /><Avatar alt="DOSE" fallback="D" /></> },
  { id: 'tabs', name: 'Tabs', category: 'UI', description: 'Switches between related content views in the same space.', source: `<Tabs defaultValue="movies" className="w-full">
  <TabsList><TabsTrigger value="movies">Movies</TabsTrigger><TabsTrigger value="shows">Shows</TabsTrigger></TabsList>
  <TabsContent value="movies">Movie library content</TabsContent>
  <TabsContent value="shows">TV library content</TabsContent>
</Tabs>`, preview: <Tabs defaultValue="movies" className="w-full"><TabsList><TabsTrigger value="movies">Movies</TabsTrigger><TabsTrigger value="shows">Shows</TabsTrigger></TabsList><TabsContent value="movies">Movie library content</TabsContent><TabsContent value="shows">TV library content</TabsContent></Tabs> },
  { id: 'poster', name: 'Poster', category: 'Media', description: 'Displays media artwork, metadata, interaction, and image fallback states.', source: `<div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3">
  <Poster src={artwork} title="Loaded poster" subtitle="Normal state" interaction={{ href: '#loaded' }} />
  <Poster title="Missing poster" subtitle="Fallback state" />
  <Poster title="Action poster" subtitle="Button composition" interaction={{ onClick: () => undefined, ariaLabel: 'Open Action poster' }} />
</div>`, preview: <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3"><Poster src={artwork} title="Loaded poster" subtitle="Normal state" interaction={{ href: '#loaded' }} /><Poster title="Missing poster" subtitle="Fallback state" /><Poster title="Action poster" subtitle="Button composition" interaction={{ onClick: () => undefined, ariaLabel: 'Open Action poster' }} /></div> },
  { id: 'carousel', name: 'Carousel', category: 'Media', description: 'Arranges a responsive, horizontally scrollable row of media.', source: `<div className="w-full min-w-0">
  <Carousel label="Featured titles" heading="Featured titles" items={posters} getItemKey={(item) => item.id} itemClassName="w-36 sm:w-44" renderItem={(item) => <Poster src={item.src} title={item.title} subtitle={item.subtitle} />} />
</div>`, preview: <div className="w-full min-w-0"><Carousel label="Featured titles" heading="Featured titles" items={posters} getItemKey={(item) => item.id} itemClassName="w-36 sm:w-44" renderItem={(item) => <Poster src={item.src} title={item.title} subtitle={item.subtitle} />} /></div> },
  { id: 'hero', name: 'Hero', category: 'Media', description: 'Leads a media page with responsive artwork, metadata, and actions.', source: `<div className="w-full min-w-0 overflow-hidden rounded-lg">
  <Hero imageSrc={backdrop} imageAlt="Abstract purple and blue landscape" eyebrow="Featured tonight" title="The Last Horizon" metadata={<><span>2026</span><span>2h 8m</span><span>PG-13</span></>} description="A responsive featured title." actions={<><Button>Play</Button><Button variant="secondary">More information</Button></>} />
</div>`, preview: <div className="w-full min-w-0 overflow-hidden rounded-lg"><Hero imageSrc={backdrop} imageAlt="Abstract purple and blue landscape" eyebrow="Featured tonight" title="The Last Horizon" metadata={<><span>2026</span><span>2h 8m</span><span>PG-13</span></>} description="A responsive featured title." actions={<><Button>Play</Button><Button variant="secondary">More information</Button></>} /></div> },
  { id: 'navbar', name: 'Navbar', category: 'Media', description: 'Provides responsive media navigation, branding, and account actions.', source: `<div className="w-full min-w-0 overflow-hidden rounded-lg">
  <Navbar brandLabel="DOSE home" brand="DOSE" brandImage={{ src: artwork, alt: 'DOSE logo' }} brandHref="#home" items={[{ id: 'movies', label: 'Movies', href: '#movies' }, { id: 'shows', label: 'Shows', href: '#shows' }]} activeId="movies" actions={<Button size="sm" variant="outline">Profile</Button>} />
</div>`, preview: <div className="w-full min-w-0 overflow-hidden rounded-lg"><Navbar brandLabel="DOSE home" brand="DOSE" brandImage={{ src: artwork, alt: 'DOSE logo' }} brandHref="#home" items={[{ id: 'movies', label: 'Movies', href: '#movies' }, { id: 'shows', label: 'Shows', href: '#shows' }]} activeId="movies" actions={<Button size="sm" variant="outline">Profile</Button>} /></div> },
  { id: 'media-card', name: 'Media Card', category: 'Media', description: 'Netflix-style landscape card with hover reveal, optional badge, and watch-progress bar.', source: `<div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <MediaCard title="Arrival" imageSrc={backdrop} subtitle="2016 · Sci-fi" interaction={{ href: '#arrival' }} />
  <MediaCard title="The Edge" imageSrc={backdrop} subtitle="S2 · E4" progress={0.4} badge="Resume" interaction={{ href: '#edge' }} />
  <MediaCard title="Missing artwork" subtitle="Fallback state" />
</div>`, preview: <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><MediaCard title="Arrival" imageSrc={backdrop} subtitle="2016 · Sci-fi" interaction={{ href: '#arrival' }} /><MediaCard title="The Edge" imageSrc={backdrop} subtitle="S2 · E4" progress={0.4} badge="Resume" interaction={{ href: '#edge' }} /><MediaCard title="Missing artwork" subtitle="Fallback state" /></div> },
  { id: 'search-dropdown', name: 'Search Dropdown', category: 'Media', description: 'Grouped instant-search results with poster thumb, title, year, runtime, quality badge, and keyboard navigation.', source: `function SearchPreview() {
  const [query, setQuery] = useState('');
  const groups = /* filter searchGroups by query */ searchGroups;
  return <SearchDropdown query={query} onQueryChange={setQuery} groups={groups} />;
}

<SearchPreview />`, preview: <SearchPreview /> },
  { id: 'video-player', name: 'Video Player', category: 'Media', description: 'Custom video controls — scrubber with buffered progress, volume, ±10s, captions menu, quality/audio menu, PiP, fullscreen, keyboard shortcuts.', source: `function VideoPreview() {
  const [quality, setQuality] = useState('auto');
  const [audio, setAudio] = useState('en');
  return <VideoPlayer
    src={trailerSample}
    title="Sample trailer"
    qualities={[{ id: 'auto', label: 'Auto' }, { id: '1080', label: '1080p · Transcode' }]}
    activeQualityId={quality} onQualityChange={setQuality}
    audioTracks={[{ id: 'en', label: 'English 5.1' }, { id: 'sv', label: 'Svenska' }]}
    activeAudioId={audio} onAudioChange={setAudio}
  />;
}

<VideoPreview />`, preview: <VideoPreview /> },
];
