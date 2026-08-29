import { fireEvent, render, screen } from '@testing-library/react';
import { FamilyManager } from './FamilyManager';

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }

describe('FamilyManager', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('requires confirmation before deleting and refetches accounts', async () => {
    const member = { id: 'member-id', username: 'guest', role: 'member', disabled: false, createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ users: [member] })).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({ users: [] }));
    globalThis.fetch = fetchMock; render(<FamilyManager open actorId="admin-id" onOpenChange={() => undefined}/>);
    await screen.findByText('guest'); fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete guest?' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(await screen.findByText('No family accounts.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/users/member-id', expect.objectContaining({ method: 'DELETE' }));
  });

  it('creates a family member and refetches accounts', async () => {
    const member = { id: 'u2', username: 'guest', role: 'member', disabled: false, createdAt: '', updatedAt: '' };
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ users: [] })).mockResolvedValueOnce(json({ user: member }, 201)).mockResolvedValueOnce(json({ users: [member] }));
    globalThis.fetch = fetchMock; render(<FamilyManager open actorId="admin-id" onOpenChange={() => undefined}/>);
    await screen.findByText('No family accounts.', {}, { timeout: 100 }).catch(() => undefined);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'guest' } });
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'long-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add family member' }));
    expect(await screen.findByText('guest')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/users', expect.objectContaining({ method: 'POST' }));
  });

  it('does not offer destructive controls for the acting account', async () => {
    const actor = { id: 'admin-id', username: 'admin', role: 'admin', disabled: false, createdAt: '', updatedAt: '' };
    globalThis.fetch = vi.fn().mockResolvedValue(json({ users: [actor] })); render(<FamilyManager open actorId="admin-id" onOpenChange={() => undefined}/>);
    await screen.findByText('admin (you)'); expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Reset password' })).toBeDisabled();
    expect(screen.getByText('Your own password cannot be reset from family management.')).toBeInTheDocument();
  });

  it('keeps the reset dialog and password intact when reset fails', async () => {
    const member = { id: 'member-id', username: 'guest', role: 'member', disabled: false, createdAt: '', updatedAt: '' };
    globalThis.fetch = vi.fn().mockResolvedValueOnce(json({ users: [member] })).mockResolvedValueOnce(json({ error: 'Password policy rejected this password' }, 400));
    render(<FamilyManager open actorId="admin-id" onOpenChange={() => undefined}/>); await screen.findByText('guest');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' })); const input = screen.getByLabelText('New password'); fireEvent.change(input, { target: { value: 'long-password' } });
    const resetButtons = screen.getAllByRole('button', { name: 'Reset password' }); fireEvent.click(resetButtons[resetButtons.length - 1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Password policy rejected this password');
    expect(screen.getByRole('heading', { name: "Reset guest's password" })).toBeInTheDocument(); expect(input).toHaveValue('long-password');
  });
});
