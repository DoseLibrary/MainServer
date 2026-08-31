import { useCallback, useEffect, useState } from 'react';
import { AuthPage, type LoginFormValues } from '@/pages/AuthPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { api, ApiError, imageVariant, type CatalogHome, type Library, type User } from '@/lib/api';
import { CatalogSearch } from '@/components/media/CatalogSearch';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/media/UserMenu';
import { RandomPickerModal } from '@/components/media/RandomPickerModal';

type AppState =
  | { name: 'loading' }
  | { name: 'setup' }
  | { name: 'login' }
  | { name: 'library'; user: User; libraries: Library[] }
  | { name: 'error'; message: string };

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'Dose could not connect to the local server.';
}

export function Home() {
  const [state, setState] = useState<AppState>({ name: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>();
  const [catalog, setCatalog] = useState<CatalogHome>();
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string>();
  const [randomOpen, setRandomOpen] = useState(false);

  const loadCatalog = useCallback(async (libraryId?: string) => {
    setCatalogStatus('loading');
    try { setCatalog(await api.catalogHome(libraryId)); setCatalogStatus('loaded'); }
    catch (error) { setCatalogError(errorMessage(error)); setCatalogStatus('error'); }
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const { setupRequired } = await api.setupStatus();
      if (setupRequired) {
        setState({ name: 'setup' });
        return;
      }
      try {
        const [{ user }, { libraries }] = await Promise.all([api.me(), api.libraries()]);
        setState({ name: 'library', user, libraries });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) setState({ name: 'login' });
        else throw error;
      }
    } catch (error) {
      setState({ name: 'error', message: errorMessage(error) });
    }
  }, []);

  function retryBootstrap() {
    setState({ name: 'loading' });
    void bootstrap();
  }

  useEffect(() => {
    queueMicrotask(() => { void bootstrap(); });
  }, [bootstrap]);

  useEffect(() => {
    if (state.name !== 'library') return;
    if (state.libraries.length === 0) {
      queueMicrotask(() => { setCatalog({ sections: [] }); setCatalogStatus('loaded'); });
      return;
    }
    // Default to every library so movies and shows share one home; a nav item filters.
    const next = selectedLibraryId && state.libraries.some((library) => library.id === selectedLibraryId) ? selectedLibraryId : undefined;
    queueMicrotask(() => {
      if (next !== selectedLibraryId) setSelectedLibraryId(next);
      void loadCatalog(next);
    });
  }, [state, selectedLibraryId, loadCatalog]);

  async function authenticate(values: LoginFormValues) {
    setSubmitting(true);
    setFormError(undefined);
    try {
      if (state.name === 'setup') await api.setup(values);
      else await api.login(values);
      const [{ user }, { libraries }] = await Promise.all([api.me(), api.libraries()]);
      setState({ name: 'library', user, libraries });
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.name === 'loading') {
    return <LibraryPage title="Your library" state="loading" navigation={{ brandLabel: 'DOSE', items: [] }} />;
  }

  if (state.name === 'error') {
    return <LibraryPage title="Your library" state="error" errorMessage={state.message} onRetry={retryBootstrap} navigation={{ brandLabel: 'DOSE', items: [] }} />;
  }

  if (state.name === 'setup') {
    return <AuthPage mode="register" showEmail={false} brand="DOSE" brandImageSrc="/logo.svg" brandImageAlt="DOSE logo" heading="Create your administrator" description="Set up the first account for this Dose library. Use a password with at least 10 characters." alternateLabel="Local library setup" submitLabel="Create administrator" submitting={submitting} formError={formError} onSubmit={authenticate} />;
  }

  if (state.name === 'login') {
    return <AuthPage mode="login" brand="DOSE" brandImageSrc="/logo.svg" brandImageAlt="DOSE logo" backdropImageSrc="/login-backdrop.webp" backdropImageAlt="A dark home cinema with a wall of film stills" heading="Welcome back" description="Sign in to your local library." alternateLabel="Accounts are managed by your administrator" secondaryAction={{ label: 'Sign in from your phone', href: '/pair' }} submitting={submitting} formError={formError} onSubmit={authenticate} />;
  }

  const episodeLabel = (item: CatalogHome['sections'][number]['items'][number]) => (typeof item.seasonNumber === 'number' && typeof item.episodeNumber === 'number' ? `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}` : undefined);
  const sections = (catalog?.sections ?? []).map((section) => ({ id: section.id, title: section.title, layout: section.layout ?? 'poster', items: section.items.map((item) => ({ id: item.id, title: item.title, posterSrc: imageVariant(item.posterUrl, { width: 384, height: 576, fit: 'cover', format: 'webp' }), backdropSrc: imageVariant(item.backdropUrl, { width: 640, height: 360, fit: 'cover', format: 'webp' }), subtitle: episodeLabel(item) ?? ([item.year, item.genres?.[0]].filter(Boolean).join(' · ') || undefined), badge: item.badge, progress: typeof item.progress === 'number' ? Math.min(1, Math.max(0, item.progress)) : undefined, interaction: { href: `/media/${encodeURIComponent(item.id)}` } })) }));
  const featured = catalog?.featured ? { title: catalog.featured.title, logoSrc: imageVariant(catalog.featured.logoUrl, { width: 500, format: 'webp' }), description: catalog.featured.overview, imageSrc: imageVariant(catalog.featured.backdropUrl, { width: 1920, height: 1080, fit: 'cover', format: 'webp', quality: 85 }), videoSrc: catalog.featured.hasLocalTrailer ? api.trailerUrl(catalog.featured.id) : undefined, metadata: catalog.featured.year, primaryAction: { label: 'View details', href: `/media/${encodeURIComponent(catalog.featured.id)}` }, secondaryAction: catalog.featured.hasLocalTrailer ? { label: 'Fullscreen trailer', href: `/trailer/${encodeURIComponent(catalog.featured.id)}` } : undefined } : undefined;
  return <>
    <LibraryPage
      title="Your library"
      state={state.libraries.length === 0 ? 'empty' : catalogStatus === 'error' ? 'error' : catalogStatus === 'loading' ? 'loading' : sections.every((section) => section.items.length === 0) ? 'empty' : 'loaded'}
      emptyTitle="Your library is ready"
      emptyMessage={state.libraries.length === 0 ? 'No media libraries have been added yet.' : 'No titles found. An administrator can scan this library for media.'}
      errorMessage={catalogError}
      onRetry={() => void loadCatalog(selectedLibraryId)}
      navigation={{
        brandLabel: 'DOSE',
        brand: 'DOSE',
        brandImage: { src: '/logo.svg', alt: '' },
        brandHref: '/',
        items: [{ id: 'categories', label: 'Categories', href: '/categories' }],
        actions: <><CatalogSearch libraryId={selectedLibraryId} /><Button variant="outline" size="sm" onClick={() => setRandomOpen(true)}>Random pick</Button><UserMenu user={state.user} onLogout={() => setState({ name: 'login' })} /></>,
      }}
      featured={featured}
      sections={sections}
    />
    <RandomPickerModal open={randomOpen} onOpenChange={setRandomOpen} />
  </>;
}
