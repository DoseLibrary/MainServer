import { fireEvent, render, screen } from '@testing-library/react';
import { UserMenu } from './UserMenu';

const admin = { id: 'u1', username: 'filip', role: 'admin' as const };
const member = { id: 'u2', username: 'guest', role: 'member' as const };

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function openMenu() {
  const trigger = screen.getByRole('button', { name: /Account menu/ });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
}

it('shows admin links only to administrators', async () => {
  render(<UserMenu user={admin} />);
  openMenu();
  expect(await screen.findByText('Sign out')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Plugins/ })).toHaveAttribute('href', '/admin/plugins');
  expect(screen.getByRole('menuitem', { name: /Dashboard/ })).toHaveAttribute('href', '/admin');
});

it('hides administration from members', async () => {
  render(<UserMenu user={member} />);
  openMenu();
  expect(await screen.findByText('Sign out')).toBeInTheDocument();
  expect(screen.queryByText('Administration')).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Profile/ })).toHaveAttribute('href', '/profile');
});

it('fetches the account lazily on first open', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: member }), { status: 200 }));
  globalThis.fetch = fetchMock;
  render(<UserMenu />);
  expect(fetchMock).not.toHaveBeenCalled();

  openMenu();
  expect(await screen.findByText('guest')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me', expect.anything());
});
