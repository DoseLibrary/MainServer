import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscodingPage } from './TranscodingPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const report = { adapters: [], encoders: [], available: [], selected: null, mode: 'auto', detectedAt: '2026-01-01T00:00:00.000Z' };

describe('TranscodingPage settings', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('shows the saved encoder settings and saves a change', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) return json({ user: { id: 'a', username: 'admin', role: 'admin' } });
      if (url.endsWith('/admin/transcoding')) return json({ hardware: report });
      if (url.endsWith('/admin/transcoding/settings') && init?.method === 'PATCH') return json({ settings: { ...JSON.parse(String(init.body)), threads: 0 } });
      if (url.endsWith('/admin/transcoding/settings')) return json({ settings: { preset: 'medium', quality: 19, threads: 0, preferHevcOutput: false } });
      return json({}, 404);
    });
    globalThis.fetch = fetchMock;
    render(<MemoryRouter><TranscodingPage /></MemoryRouter>);

    const preset = await screen.findByLabelText('Speed preset');
    await waitFor(() => expect(preset).toHaveValue('medium'));
    expect(screen.getByLabelText('Quality')).toHaveValue(19);

    fireEvent.change(preset, { target: { value: 'slow' } });
    fireEvent.click(screen.getByLabelText('Prefer HEVC output'));
    fireEvent.click(screen.getByRole('button', { name: 'Save encoder settings' }));

    await waitFor(() => expect(screen.getByText('Encoder settings saved')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/transcoding/settings', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ preset: 'slow', quality: 19, threads: 0, preferHevcOutput: true }) }));
  });
});
