import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PluginsPage } from './PluginsPage';

it('renders plugin configuration as a page rather than an overflowing dialog', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plugins: [] }), { status: 200 }));
  const { container } = render(<MemoryRouter><PluginsPage /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(container.querySelector('main')).toHaveClass('min-h-0');
});
