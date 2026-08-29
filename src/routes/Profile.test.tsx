import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Profile } from './Profile';

describe('Profile', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('shows account details and administrator controls to admins', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'filip', role: 'admin' } });
      if (url.endsWith('/libraries')) return json({ libraries: [{ id: 'l1', name: 'Movies', kind: 'movies' }] });
      if (url.endsWith('/health')) return json({ status: 'ok', database: 'ok' });
      return json({}, 404);
    });
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'filip' })).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage libraries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage family' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Healthy')).toHaveLength(2));
  });

  it('hides administration controls from members', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/auth/me') ? json({ user: { id: 'u2', username: 'guest', role: 'member' } }) : String(input).endsWith('/libraries') ? json({ libraries: [] }) : json({ status: 'ok', database: 'ok' }));
    render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'guest' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Administration' })).not.toBeInTheDocument();
  });
});

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
