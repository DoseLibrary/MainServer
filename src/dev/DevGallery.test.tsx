import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/toast';
import { componentCatalog } from './componentCatalog';
import { pageCatalog } from './pageCatalog';
import { DevGallery } from './DevGallery';
import { DevFullPage } from './DevFullPage';

function renderGallery(search = '') {
  window.history.replaceState({}, '', `/dev${search}`);
  return render(<ToastProvider><DevGallery /></ToastProvider>);
}

function setClipboard(value: Pick<Clipboard, 'writeText'> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('DevGallery', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    setClipboard(undefined);
  });

  it('provides navigation for all catalog components and focuses the selected URL item', () => {
    renderGallery('?component=hero');

    expect(componentCatalog).toHaveLength(17);
    for (const item of componentCatalog) expect(screen.getByRole('link', { name: item.name })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Hero' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Button' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hero' })).toHaveAttribute('aria-current', 'page');
  });

  it('selects through a real navigation link, updates the URL, and falls back for an invalid selection', () => {
    renderGallery('?component=not-a-component');
    expect(screen.getByRole('heading', { level: 1, name: 'Button' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Tabs' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Tabs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tabs' })).toHaveAttribute('aria-current', 'page');
    expect(window.location.search).toBe('?component=tabs');
  });

  it('exposes an expanded, dismissible mobile component menu', async () => {
    renderGallery('?component=button');
    const trigger = screen.getByRole('button', { name: 'Open component menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('navigation', { name: 'Component documentation' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Button' })).toHaveAttribute('aria-current', 'page');

    const inputLink = within(dialog).getByRole('link', { name: 'Input' });
    fireEvent.click(inputLink);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { level: 1, name: 'Input' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Input' })).toHaveAttribute('aria-current', 'page');
    expect(window.location.search).toBe('?component=input');
  });

  it('renders semantic source and copies the exact static string with accessible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { container } = renderGallery('?component=button');

    const source = componentCatalog.find(({ id }) => id === 'button')!.source;
    const code = container.querySelector('pre > code');
    if (!code) throw new Error('Expected semantic code element');
    expect(code.textContent).toBe(source);
    expect(code.tagName).toBe('CODE');
    expect(code.parentElement?.tagName).toBe('PRE');
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(source));
    expect(await screen.findByText('Code copied to clipboard.')).toHaveAttribute('role', 'status');
  });

  it.each([
    ['rejected', { writeText: vi.fn().mockRejectedValue(new Error('denied')) }],
    ['unavailable', undefined],
  ])('handles an %s clipboard without crashing', async (_case, clipboard) => {
    setClipboard(clipboard);
    renderGallery('?component=spinner');
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText('Unable to copy code.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('heading', { level: 1, name: 'Spinner' })).toBeInTheDocument();
  });

  it('adds a Pages group alongside the preserved component catalog', () => {
    renderGallery('?component=auth-login');

    expect(pageCatalog).toHaveLength(14);
    expect(screen.getByRole('heading', { level: 2, name: 'Pages' })).toBeInTheDocument();
    for (const item of componentCatalog) expect(screen.getByRole('link', { name: item.name })).toBeInTheDocument();
    for (const item of pageCatalog) expect(screen.getByRole('link', { name: item.name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auth — Login' })).toHaveAttribute('aria-current', 'page');
  });

  it('selects page state previews directly through the URL and renders exact source', () => {
    const { container } = renderGallery('?component=library-error');
    expect(screen.getByRole('heading', { level: 1, name: 'Library — Error' })).toBeInTheDocument();

    const source = pageCatalog.find(({ id }) => id === 'library-error')!.source;
    const code = container.querySelector('pre > code');
    expect(code?.textContent).toBe(source);
  });

  it('navigates from a component to a page entry through a real link', () => {
    renderGallery('?component=button');
    fireEvent.click(screen.getByRole('link', { name: 'Media Details — Movie (admin)' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Media Details — Movie (admin)' })).toBeInTheDocument();
    expect(window.location.search).toBe('?component=media-movie');
  });

  it('offers device viewports and an open-full-page link for pages', () => {
    renderGallery('?component=library-error');

    const openLink = screen.getByRole('link', { name: /Open full page/ });
    expect(openLink).toHaveAttribute('href', '/dev/full?id=library-error');
    expect(openLink).toHaveAttribute('target', '_blank');

    const desktop = screen.getByRole('button', { name: 'Desktop' });
    expect(desktop).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(screen.getByRole('button', { name: 'Mobile' })).toHaveAttribute('aria-pressed', 'true');
    expect(desktop).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders a requested fixture full-screen with a back link', () => {
    window.history.replaceState({}, '', '/dev/full?id=auth-login');
    render(<DevFullPage />);
    expect(screen.getByRole('link', { name: /Back to docs/ })).toHaveAttribute('href', '/dev?component=auth-login');
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });
});
