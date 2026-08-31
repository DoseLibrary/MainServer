import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminHome } from './AdminHome';
import { LibrariesAdminPage } from './LibrariesAdminPage';
import { FamilyAdminPage } from './FamilyAdminPage';
import { MediaAdminPage } from './MediaAdminPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function stubApi() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'filip', role: 'admin' } });
    if (url.endsWith('/libraries')) return json({ libraries: [{ id: 'l1', name: 'Movies', kind: 'movies', rootPath: '/media/movies' }] });
    if (url.endsWith('/health')) return json({ status: 'ok', database: 'ok', metadata: { tmdb: 'configured' } });
    if (url.endsWith('/users')) return json({ users: [{ id: 'u1', username: 'filip', role: 'admin', disabled: false }] });
    if (url.includes('/admin/media')) return json({ total: 0, items: [] });
    if (url.includes('/scans/latest')) return json({ scan: null });
    return json({}, 404);
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/libraries" element={<LibrariesAdminPage />} />
        <Route path="/admin/users" element={<FamilyAdminPage />} />
        <Route path="/admin/media" element={<MediaAdminPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

it('renders the admin overview with section cards, status, and tabs', async () => {
  stubApi();
  renderAt('/admin');

  expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manage libraries' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manage family' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manage media' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Manage plugins' })).toBeInTheDocument();
  expect((await screen.findAllByText('Healthy')).length).toBe(3);
  expect(screen.getByRole('navigation', { name: 'Administration sections' })).toBeInTheDocument();
});

it('renders library management as a page, not a dialog', async () => {
  stubApi();
  renderAt('/admin/libraries');

  expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
  expect((await screen.findAllByText('Movies')).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Add library' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('renders family management as a page for the signed-in admin', async () => {
  stubApi();
  renderAt('/admin/users');

  expect(await screen.findByRole('heading', { name: 'Family accounts' })).toBeInTheDocument();
  expect(await screen.findByText('filip (you)')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('renders the media admin list without the modal height cap', async () => {
  stubApi();
  const { container } = renderAt('/admin/media');

  expect(await screen.findByRole('heading', { name: 'Media' })).toBeInTheDocument();
  expect(await screen.findByText('No titles match.')).toBeInTheDocument();
  expect(container.querySelector('.max-h-\\[55vh\\]')).toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
