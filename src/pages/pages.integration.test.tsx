import { fireEvent, render, screen } from '@testing-library/react';
import { AuthPage } from './AuthPage';
import { LibraryPage, type LibrarySection } from './LibraryPage';
import { MediaDetailsPage } from './MediaDetailsPage';
import { ServerPickerPage, type ServerPickerItem } from './ServerPickerPage';

describe('AuthPage', () => {
  it('submits login credentials from the form', () => {
    const onSubmit = vi.fn();
    render(
      <AuthPage
        mode="login"
        brand="DOSE"
        heading="Welcome back"
        description="Sign in."
        alternateLabel="Register"
        alternateHref="#register"
        defaultValues={{ username: 'filip', password: 'secret' }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSubmit).toHaveBeenCalledWith({ username: 'filip', password: 'secret' });
  });

  it('adds an email field in register mode and surfaces errors accessibly', () => {
    const onSubmit = vi.fn();
    render(
      <AuthPage
        mode="register"
        brand="DOSE"
        heading="Create account"
        description="Register."
        alternateLabel="Sign in"
        alternateHref="#login"
        formError="Username already taken."
        fieldErrors={{ username: 'Already taken' }}
        defaultValues={{ username: 'a', email: 'a@b.co', password: 'pw' }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Username already taken.');
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).toHaveBeenCalledWith({ username: 'a', email: 'a@b.co', password: 'pw' });
  });

  it('disables submission while submitting', () => {
    render(
      <AuthPage mode="login" brand="DOSE" heading="Welcome" description="." alternateLabel="Register" alternateHref="#r" submitting onSubmit={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Please wait/ })).toBeDisabled();
  });
});

describe('ServerPickerPage', () => {
  const servers: ServerPickerItem[] = [
    { id: 'a', name: 'Living room', address: '10.0.0.2:3001', status: 'Online', availability: 'online' },
    { id: 'b', name: 'Attic', address: '10.0.0.3:3001', status: 'Offline', availability: 'offline', disabled: true },
  ];

  it('lists servers and reports selection through a callback', () => {
    const onSelectServer = vi.fn();
    render(<ServerPickerPage servers={servers} onSelectServer={onSelectServer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select server: Living room' }));
    expect(onSelectServer).toHaveBeenCalledWith(servers[0]);
    expect(screen.getByRole('button', { name: 'Select server: Attic' })).toBeDisabled();
  });

  it('exposes a labelled busy region while loading', () => {
    render(<ServerPickerPage state="loading" />);
    expect(screen.getByRole('status', { name: 'Loading content servers' })).toHaveAttribute('aria-busy', 'true');
  });

  it('offers a connect action when empty', () => {
    const onConnect = vi.fn();
    render(<ServerPickerPage servers={[]} onConnect={onConnect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect a server' }));
    expect(onConnect).toHaveBeenCalled();
  });

  it('announces an error and retries', () => {
    const onRetry = vi.fn();
    render(<ServerPickerPage state="error" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('LibraryPage', () => {
  const navigation = {
    brandLabel: 'DOSE home',
    brand: 'DOSE',
    items: [{ id: 'movies', label: 'Movies', href: '#movies' }] as const,
    activeId: 'movies',
  };
  const sections: LibrarySection[] = [
    { id: 'new', title: 'Newly added', items: [{ id: 'arrival', title: 'Arrival', interaction: { href: '#arrival' } }] },
  ];

  it('renders featured media and section items with supplied hrefs', () => {
    render(
      <LibraryPage
        navigation={navigation}
        title="Movies"
        featured={{ title: 'The Last Horizon', primaryAction: { label: 'Play', href: '#play' } }}
        sections={sections}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Newly added' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Arrival/ })).toHaveAttribute('href', '#arrival');
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '#play');
  });

  it('handles empty and error states with recovery actions', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<LibraryPage navigation={navigation} title="Movies" state="error" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();

    rerender(<LibraryPage navigation={navigation} title="Movies" state="empty" emptyAction={{ label: 'Add a server', href: '#servers' }} />);
    expect(screen.getByRole('link', { name: 'Add a server' })).toHaveAttribute('href', '#servers');
  });
});

describe('MediaDetailsPage', () => {
  const navigation = { brandLabel: 'DOSE home', brand: 'DOSE', items: [{ id: 'movies', label: 'Movies', href: '#movies' }] as const };

  it('renders a movie with cast, recommendations, and supplied actions', () => {
    const onWatchlist = vi.fn();
    render(
      <MediaDetailsPage
        kind="movie"
        navigation={navigation}
        title="Arrival"
        overview="A linguist decodes an alien language."
        primaryAction={{ label: 'Play', href: '#play' }}
        secondaryAction={{ label: 'Add to watchlist', onClick: onWatchlist }}
        cast={[{ id: 'a', name: 'Amy Adams', role: 'Louise' }]}
        recommendations={[{ id: 'signal', title: 'Signal', interaction: { href: '#signal' } }]}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Arrival' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cast' })).toBeInTheDocument();
    expect(screen.getByText('Amy Adams')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '#play');
    fireEvent.click(screen.getByRole('button', { name: 'Add to watchlist' }));
    expect(onWatchlist).toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2, name: 'More like this' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Signal/ })).toHaveAttribute('href', '#signal');
  });

  it('shows trailer, watched toggle, and admin manage menu when enabled', () => {
    const onPlayTrailer = vi.fn();
    const onToggleWatched = vi.fn();
    const onEditMetadata = vi.fn();
    render(
      <MediaDetailsPage
        kind="movie"
        title="Arrival"
        primaryAction={{ label: 'Play', href: '#play' }}
        onPlayTrailer={onPlayTrailer}
        onToggleWatched={onToggleWatched}
        canManage
        onEditMetadata={onEditMetadata}
        adminActions={[{ id: 'images', label: 'Manage images', onSelect: vi.fn() }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play trailer' }));
    expect(onPlayTrailer).toHaveBeenCalled();

    const watched = screen.getByRole('button', { name: 'Mark as watched' });
    expect(watched).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(watched);
    expect(onToggleWatched).toHaveBeenCalled();

    // Admin management is surfaced through a menu trigger; its items open on demand.
    expect(screen.getByRole('button', { name: 'Manage' })).toHaveAttribute('aria-haspopup', 'menu');
    expect(onEditMetadata).not.toHaveBeenCalled();
  });

  it('hides the admin manage menu for non-managers and reflects watched state', () => {
    render(
      <MediaDetailsPage
        kind="movie"
        title="Arrival"
        watched
        onToggleWatched={vi.fn()}
        onEditMetadata={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Watched' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play trailer' })).not.toBeInTheDocument();
  });

  it('renders a show with a seasons list', () => {
    render(
      <MediaDetailsPage
        kind="show"
        title="The Edge"
        seasons={[{ id: 's1', name: 'Season 1', episodeCount: 8, interaction: { href: '#s1' } }]}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Seasons' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Season 1' })).toHaveAttribute('href', '#s1');
    expect(screen.getByText('8 episodes')).toBeInTheDocument();
  });

  it('exposes loading and error states without artwork', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<MediaDetailsPage kind="movie" title="Arrival" state="loading" />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');

    rerender(<MediaDetailsPage kind="movie" title="Arrival" state="error" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
