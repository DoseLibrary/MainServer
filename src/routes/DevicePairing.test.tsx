import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PairDevice } from './PairDevice';
import { LinkDevice } from './LinkDevice';
import { DeviceList } from './DeviceList';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const pairing = {
  userCode: 'K7QP-2M4X', deviceCode: 'device-secret-code-value', deviceName: 'Chrome on TV',
  expiresAt: new Date(Date.now() + 600_000).toISOString(), intervalMs: 20,
  verificationPath: '/link', verificationPathComplete: '/link?code=K7QP-2M4X',
};

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe('PairDevice (the screen without a keyboard)', () => {
  it('shows the code and a locally generated QR while waiting', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/device/start')) return json(pairing);
      return json({ status: 'pending' });
    }) as unknown as typeof fetch;

    render(<MemoryRouter><PairDevice /></MemoryRouter>);

    expect(await screen.findByText('K7QP-2M4X')).toBeInTheDocument();
    // The QR is a data URL: no third-party service is contacted to draw it.
    const qr = await screen.findByRole('img', { name: /QR code/ });
    await waitFor(() => expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/));
  });

  it('signs in once the request is approved', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, origin: 'http://tv.local', host: 'tv.local', assign } as unknown as Location);
    let polls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/device/start')) return json(pairing);
      polls += 1;
      return json(polls > 1 ? { status: 'approved', user: { id: 'u1', username: 'owner', role: 'admin' } } : { status: 'pending' });
    }) as unknown as typeof fetch;

    render(<MemoryRouter><PairDevice /></MemoryRouter>);

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'), { timeout: 2000 });
  });

  it('offers a fresh code when the request is declined', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/device/start')) return json(pairing);
      return json({ status: 'denied' });
    }) as unknown as typeof fetch;

    render(<MemoryRouter><PairDevice /></MemoryRouter>);

    expect(await screen.findByText('That request was declined.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get a new code' })).toBeInTheDocument();
  });

  it('stops polling and reports an expired code', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/device/start')) return json(pairing);
      return json({ error: 'This code has expired' }, 410);
    }) as unknown as typeof fetch;

    render(<MemoryRouter><PairDevice /></MemoryRouter>);

    expect(await screen.findByText('This code expired.')).toBeInTheDocument();
  });
});

describe('LinkDevice (the phone)', () => {
  function stub(handler: (url: string, init?: RequestInit) => Response) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as unknown as typeof fetch;
  }

  it('confirms the device named by a scanned code, then approves it', async () => {
    const calls: string[] = [];
    stub((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'owner', role: 'member' } });
      if (url.endsWith('/approve')) return json({ approved: { id: 'r1', deviceName: 'Chrome on TV' } });
      return json({ request: { id: 'r1', deviceName: 'Chrome on TV', status: 'pending', expiresAt: pairing.expiresAt, createdAt: new Date().toISOString() } });
    });

    render(<MemoryRouter initialEntries={['/link?code=K7QP-2M4X']}><LinkDevice /></MemoryRouter>);

    expect(await screen.findByText('Chrome on TV')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Signed in on Chrome on TV.')).toBeInTheDocument();
    expect(calls).toContain('POST /api/v1/auth/device/K7QP-2M4X/approve');
  });

  it('declines with Not me', async () => {
    const calls: string[] = [];
    stub((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'owner', role: 'member' } });
      if (url.endsWith('/deny')) return new Response(null, { status: 204 });
      return json({ request: { id: 'r1', deviceName: 'Unknown device', status: 'pending', expiresAt: pairing.expiresAt, createdAt: new Date().toISOString() } });
    });

    render(<MemoryRouter initialEntries={['/link?code=K7QP-2M4X']}><LinkDevice /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Not me' }));

    expect(await screen.findByText('Request declined.')).toBeInTheDocument();
    expect(calls).toContain('POST /api/v1/auth/device/K7QP-2M4X/deny');
  });

  it('accepts a hand-typed code and explains an expired one', async () => {
    stub((url) => {
      if (url.endsWith('/auth/me')) return json({ user: { id: 'u1', username: 'owner', role: 'member' } });
      return json({ error: 'This code has expired' }, 410);
    });

    render(<MemoryRouter initialEntries={['/link']}><LinkDevice /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Code from the device'), { target: { value: 'k7qp2m4x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('That code expired. Ask the device for a new one.')).toBeInTheDocument();
  });
});

describe('DeviceList', () => {
  const sessions = [
    { id: 's1', deviceName: 'Chrome on Windows', createdVia: 'password', createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), expiresAt: pairing.expiresAt, current: true },
    { id: 's2', deviceName: 'TV in the den', createdVia: 'device', createdAt: new Date().toISOString(), lastSeenAt: new Date(Date.now() - 3_600_000).toISOString(), expiresAt: pairing.expiresAt, current: false },
  ];

  it('marks the current device and revokes the others', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return json({ sessions });
    }) as unknown as typeof fetch;

    render(<MemoryRouter><DeviceList /></MemoryRouter>);

    expect(await screen.findByText('This device')).toBeInTheDocument();
    expect(screen.getByText(/Paired with a code/)).toBeInTheDocument();
    // Only the other device can be signed out.
    const signOut = screen.getAllByRole('button', { name: 'Sign out' });
    expect(signOut).toHaveLength(1);

    fireEvent.click(signOut[0]);
    await waitFor(() => expect(calls).toContain('DELETE /api/v1/me/sessions/s2'));
  });
});
