import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { Carousel } from './Carousel';
import { Hero } from './Hero';
import { MediaCard } from './MediaCard';
import { Navbar } from './Navbar';
import { Poster } from './Poster';

describe('media component integration', () => {
  it('composes all media patterns with accessible names and active state', () => {
    render(
      <>
        <Navbar
          brandLabel="DOSE home"
          brand="DOSE"
          items={[{ id: 'movies', label: 'Movies', href: '#movies' }]}
          activeId="movies"
        />
        <Hero title="Featured film" description="A featured selection" actions={<button type="button">Play</button>} />
        <Carousel label="Popular titles" heading="Popular titles">
          <Poster title="Example film" interaction={{ href: '#example', ariaLabel: 'Open Example film' }} />
        </Carousel>
      </>,
    );

    expect(screen.getByRole('group', { name: 'DOSE home' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Movies' })[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'Featured film' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Popular titles' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Example film' })).toBeInTheDocument();
  });

  it('renders stable accessible fallbacks when media images fail or are absent', () => {
    render(
      <>
        <Navbar brandLabel="DOSE" brandImage={{ src: 'brand.png', alt: 'DOSE mark' }} items={[]} />
        <Hero imageSrc="hero.jpg" imageAlt="Featured artwork" title="Feature" />
        <Poster src="poster.jpg" alt="Poster artwork" title="Film" />
      </>,
    );

    fireEvent.error(screen.getByAltText('DOSE mark'));
    fireEvent.error(screen.getByAltText('Featured artwork'));
    fireEvent.error(screen.getByAltText('Poster artwork'));

    expect(screen.getByRole('img', { name: 'DOSE mark image unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Featured artwork unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Poster artwork image unavailable' })).toBeInTheDocument();
  });

  it('renders a media card as a link with a progress bar and image fallback', () => {
    render(
      <>
        <MediaCard title="Arrival" imageSrc="art.jpg" subtitle="2016 · Sci-fi" progress={0.5} interaction={{ href: '#arrival' }} />
        <MediaCard title="No artwork" />
      </>,
    );

    const link = screen.getByRole('link', { name: 'Arrival' });
    expect(link).toHaveAttribute('href', '#arrival');
    expect(within(link).getByRole('img', { name: 'Arrival' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'No artwork image unavailable' })).toBeInTheDocument();
  });

  it('plays a muted background trailer with pause and mute controls', () => {
    render(<Hero title="Featured film" videoSrc="trailer.mp4" videoPoster="poster.jpg" />);

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('poster', 'poster.jpg');
    expect((video as HTMLVideoElement).muted).toBe(true);

    const mute = screen.getByRole('button', { name: 'Unmute trailer' });
    fireEvent.click(mute);
    expect(screen.getByRole('button', { name: 'Mute trailer' })).toBeInTheDocument();
    expect((document.querySelector('video') as HTMLVideoElement).muted).toBe(false);
  });

  it('keeps an empty carousel free of unusable controls', () => {
    render(<Carousel label="Empty library" items={[]} renderItem={() => null} />);

    const carousel = screen.getByRole('region', { name: 'Empty library' });
    expect(within(carousel).queryByRole('button')).not.toBeInTheDocument();
    expect(within(carousel).queryByRole('list')).not.toBeInTheDocument();
  });

  it('scrolls by a predictable viewport amount and updates boundary controls', async () => {
    render(<Carousel label="Scrollable titles"><span>One</span><span>Two</span></Carousel>);
    const list = screen.getByRole('list');
    Object.defineProperties(list, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 1000 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    const scrollBy = vi.fn();
    Object.defineProperty(list, 'scrollBy', { configurable: true, value: scrollBy });
    fireEvent.scroll(list);

    const previous = screen.getByRole('button', { name: 'Previous items' });
    const next = screen.getByRole('button', { name: 'Next items' });
    expect(previous).toBeDisabled();
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' });

    list.scrollLeft = 700;
    fireEvent.scroll(list);
    await waitFor(() => expect(previous).toBeEnabled());
    expect(next).toBeDisabled();
  });

  it('uses viewport-relative hero height with short-screen mobile bounds', () => {
    const { container } = render(<Hero title="Responsive hero" />);
    expect(container.querySelector('section')).toHaveClass('h-[66vh]', 'min-h-[20rem]', 'max-[420px]:min-h-[16rem]');
    expect(container.querySelector('section')).not.toHaveClass('min-h-[32rem]');
  });

  it('announces the mobile menu and restores toggle focus after Escape', async () => {
    render(
      <Navbar
        brandLabel="DOSE"
        brand="DOSE"
        items={[{ id: 'movies', label: 'Movies', href: '#movies' }]}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Open Navigation menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    const closeToggle = screen.getByRole('button', { name: 'Close Navigation menu' });
    expect(closeToggle).toHaveAttribute('aria-expanded', 'true');
    const mobileNavigation = screen.getByRole('navigation', { name: 'Primary navigation mobile' });
    await waitFor(() => expect(within(mobileNavigation).getByRole('link', { name: 'Movies' })).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Navigation menu' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Open Navigation menu' })).toHaveAttribute('aria-expanded', 'false');
  });
});
