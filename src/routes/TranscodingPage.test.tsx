import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TranscodingPage } from './TranscodingPage';

const NVENC_REPORT = {
  adapters: ['NVIDIA GeForce RTX 4070 Ti SUPER'],
  encoders: [
    { family: 'nvenc', encoder: 'h264_nvenc', codec: 'h264', built: true, working: true },
    { family: 'qsv', encoder: 'h264_qsv', codec: 'h264', built: true, working: false, error: 'No capable devices found' },
    { family: 'videotoolbox', encoder: 'h264_videotoolbox', codec: 'h264', built: false, working: false, error: 'Not in this ffmpeg build' },
  ],
  available: ['nvenc'],
  selected: 'nvenc',
  mode: 'auto',
  detectedAt: '2026-09-01T12:00:00.000Z',
};

const SOFTWARE_REPORT = { ...NVENC_REPORT, adapters: [], encoders: [], available: [], selected: null };

function view() {
  render(<MemoryRouter initialEntries={['/admin/transcoding']}><Routes><Route path="/admin/transcoding" element={<TranscodingPage />} /></Routes></MemoryRouter>);
}

describe('TranscodingPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('reports the selected GPU encoder and what was tested', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hardware: NVENC_REPORT }), { status: 200 }));
    view();

    expect(await screen.findByText(/NVIDIA NVENC in use/)).toBeInTheDocument();
    expect(screen.getByText('NVIDIA GeForce RTX 4070 Ti SUPER')).toBeInTheDocument();
    expect(screen.getByText('h264_nvenc')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
    // A built-but-unusable encoder is distinguished from one that is absent.
    expect(screen.getByText('Not usable here')).toBeInTheDocument();
    expect(screen.getByText('No capable devices found')).toBeInTheDocument();
    expect(screen.getByText('Not in this build')).toBeInTheDocument();
  });

  it('says plainly when everything runs on the processor', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hardware: SOFTWARE_REPORT }), { status: 200 }));
    view();

    expect(await screen.findByText('Software encoding')).toBeInTheDocument();
    expect(screen.getByText(/No usable GPU encoder was found/)).toBeInTheDocument();
    expect(screen.getByText('Not identified')).toBeInTheDocument();
  });

  it('surfaces a warning when a pinned family does not work here', async () => {
    const warned = { ...SOFTWARE_REPORT, mode: 'nvenc', warning: 'NVIDIA NVENC was requested but no working encoder was found; falling back to software.' };
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hardware: warned }), { status: 200 }));
    view();

    expect(await screen.findByText(/was requested but no working encoder/)).toBeInTheDocument();
  });

  it('re-probes on request and shows the new verdict', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ hardware: SOFTWARE_REPORT }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hardware: NVENC_REPORT }), { status: 200 }));
    globalThis.fetch = fetchMock;
    view();

    await screen.findByText('Software encoding');
    fireEvent.click(screen.getByRole('button', { name: /Run detection again/ }));

    expect(await screen.findByText(/NVIDIA NVENC in use/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/admin/transcoding/detect', expect.objectContaining({ method: 'POST' }));
  });

  it('shows why the page is empty when detection is unavailable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Hardware detection unavailable' }), { status: 503 }));
    view();

    expect(await screen.findByText(/Hardware detection unavailable/)).toBeInTheDocument();
  });
});
