import {
  type ReactNode,
  type MouseEventHandler,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NavbarBrandImage {
  src: string;
  /** Alternative text for the brand image. Defaults to the navbar's brand label. */
  alt?: string;
  className?: string;
}

export interface NavbarItem<Id extends string = string> {
  id: Id;
  label: ReactNode;
  href: string;
  ariaLabel?: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export interface NavbarProps<Id extends string = string> {
  /** Text alternative for the brand and accessible name for its link. */
  brandLabel: string;
  /** Arbitrary visible brand content, commonly a product name. */
  brand?: ReactNode;
  brandImage?: NavbarBrandImage;
  brandHref?: string;
  items: readonly NavbarItem<Id>[];
  activeId?: Id;
  actions?: ReactNode;
  navigationLabel?: string;
  menuLabel?: string;
  className?: string;
  contentClassName?: string;
}

const focusClasses =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function BrandImage({ image, label }: { image: NavbarBrandImage; label: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const imageLabel = image.alt ?? label;

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {status === 'loading' && (
        <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted" />
      )}
      {status !== 'error' && (
        <img
          src={image.src}
          alt={imageLabel}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={cn(
            'h-full w-full object-contain transition-opacity duration-200',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            image.className,
          )}
        />
      )}
      {status === 'error' && (
        <span
          role="img"
          aria-label={`${imageLabel} image unavailable`}
          className="flex h-full w-full items-center justify-center px-1 text-center text-[0.55rem] leading-tight text-muted-foreground"
        >
          <span aria-hidden="true">Image unavailable</span>
        </span>
      )}
    </span>
  );
}

function Brand({
  label,
  content,
  image,
  href,
}: {
  label: string;
  content?: ReactNode;
  image?: NavbarBrandImage;
  href?: string;
}) {
  const body = (
    <>
      {image && <BrandImage key={image.src} image={image} label={label} />}
      {content ?? (!image ? label : null)}
    </>
  );
  const classes = cn(
    'inline-flex min-w-0 items-center gap-2 rounded-md font-semibold text-foreground',
    focusClasses,
  );

  return href ? (
    <a href={href} aria-label={label} className={classes}>{body}</a>
  ) : (
    <div role="group" aria-label={label} className={classes}>{body}</div>
  );
}

function NavigationItems<Id extends string>({
  items,
  activeId,
  onNavigate,
}: {
  items: readonly NavbarItem<Id>[];
  activeId?: Id;
  onNavigate?: () => void;
}) {
  return items.map((item) => {
    const active = item.id === activeId;
    return (
      <a
        key={item.id}
        href={item.href}
        target={item.target}
        rel={item.rel}
        aria-label={item.ariaLabel}
        aria-current={active ? 'page' : undefined}
        onClick={(event) => { item.onClick?.(event); onNavigate?.(); }}
        className={cn(
          'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
          focusClasses,
          active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
        )}
      >
        {item.label}
      </a>
    );
  });
}

export function Navbar<Id extends string = string>({
  brandLabel,
  brand,
  brandImage,
  brandHref,
  items,
  activeId,
  actions,
  navigationLabel = 'Primary navigation',
  menuLabel = 'Navigation menu',
  className,
  contentClassName,
}: NavbarProps<Id>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    mobileMenuRef.current
      ?.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])')
      ?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <header className={cn('w-full border-b bg-background text-foreground', className)}>
      <div className={cn('mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8', contentClassName)}>
        <Brand label={brandLabel} content={brand} image={brandImage} href={brandHref} />

        <nav aria-label={navigationLabel} className="ml-auto hidden items-center gap-1 md:flex">
          <NavigationItems items={items} activeId={activeId} />
        </nav>
        {actions && <div className="hidden items-center gap-2 md:flex">{actions}</div>}

        <button
          ref={menuButtonRef}
          type="button"
          aria-label={menuOpen ? `Close ${menuLabel}` : `Open ${menuLabel}`}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            'ml-auto inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background hover:bg-accent md:hidden',
            focusClasses,
          )}
        >
          {menuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>

      <div
        id={menuId}
        ref={mobileMenuRef}
        hidden={!menuOpen}
        className="border-t px-4 py-3 md:hidden"
      >
        <nav aria-label={`${navigationLabel} mobile`} className="flex flex-col gap-1">
          <NavigationItems items={items} activeId={activeId} onNavigate={() => setMenuOpen(false)} />
        </nav>
        {actions && <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">{actions}</div>}
      </div>
    </header>
  );
}
