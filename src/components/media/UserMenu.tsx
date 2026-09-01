import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Film, History, LayoutDashboard, ListOrdered, ListVideo, LogOut, Puzzle, UserRound, UsersRound } from 'lucide-react';
import { api, type User } from '@/lib/api';
import { clearCache } from '@/lib/cache';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const HOVER_CLOSE_DELAY_MS = 150;

/** Avatar dropdown for the navbar: profile shortcuts, admin links, sign out.
 * Opens on hover (with a grace delay) as well as on click/keyboard. The account
 * is fetched lazily on first open so pages pay no extra request for the menu. */
export function UserMenu({ user: providedUser, onLogout }: { user?: User; onLogout?: () => void }) {
  const [fetchedUser, setFetchedUser] = useState<User>();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetching = useRef(false);
  // The prop wins so a host page's fresher auth state is always reflected.
  const user = providedUser ?? fetchedUser;

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function ensureUser() {
    if (user || fetching.current) return;
    fetching.current = true;
    void api.me().then(({ user: next }) => setFetchedUser(next)).catch(() => { fetching.current = false; });
  }

  const openMenu = () => { clearTimeout(closeTimer.current); ensureUser(); setOpen(true); };
  const hoverClose = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS); };

  async function logout() {
    try { await api.logout(); }
    finally {
      // The next account must not see anything cached for this one.
      clearCache();
      // The host page may need to reset its own auth state (Home shows the login
      // form in place, no navigation involved).
      if (onLogout) onLogout();
      else window.location.assign('/');
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { if (next) ensureUser(); setOpen(next); }} modal={false}>
      <DropdownMenuTrigger asChild onPointerEnter={openMenu} onPointerLeave={hoverClose}>
        <button type="button" aria-label={user ? `Account menu (${user.username})` : 'Account menu'}
          className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted text-sm font-semibold uppercase transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {user ? user.username.slice(0, 2) : <UserRound className="h-4 w-4" aria-hidden="true" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onPointerEnter={openMenu} onPointerLeave={hoverClose} className="min-w-52">
        {!user ? <DropdownMenuLabel className="font-normal text-muted-foreground">Loading account…</DropdownMenuLabel> : <>
          <DropdownMenuLabel className="flex flex-col">
            <span>{user.username}</span>
            <span className="text-xs font-normal text-muted-foreground">{user.role === 'admin' ? 'Administrator' : 'Member'}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild><a href="/profile"><UserRound className="mr-2 h-4 w-4" aria-hidden="true" />Profile</a></DropdownMenuItem>
            <DropdownMenuItem asChild><a href="/profile/collections"><ListVideo className="mr-2 h-4 w-4" aria-hidden="true" />My Collections</a></DropdownMenuItem>
            <DropdownMenuItem asChild><a href="/profile/queue"><ListOrdered className="mr-2 h-4 w-4" aria-hidden="true" />Marathon queue</a></DropdownMenuItem>
            <DropdownMenuItem asChild><a href="/profile/history"><History className="mr-2 h-4 w-4" aria-hidden="true" />Watch history</a></DropdownMenuItem>
            <DropdownMenuItem asChild><a href="/downloads"><Download className="mr-2 h-4 w-4" aria-hidden="true" />Downloads</a></DropdownMenuItem>
          </DropdownMenuGroup>
          {user.role === 'admin' && <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Administration</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem asChild><a href="/admin"><LayoutDashboard className="mr-2 h-4 w-4" aria-hidden="true" />Dashboard</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/admin/libraries"><Film className="mr-2 h-4 w-4" aria-hidden="true" />Libraries</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/admin/users"><UsersRound className="mr-2 h-4 w-4" aria-hidden="true" />Family accounts</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/admin/media"><Clapperboard className="mr-2 h-4 w-4" aria-hidden="true" />Media</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/admin/plugins"><Puzzle className="mr-2 h-4 w-4" aria-hidden="true" />Plugins</a></DropdownMenuItem>
            </DropdownMenuGroup>
          </>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}><LogOut className="mr-2 h-4 w-4" aria-hidden="true" />Sign out</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
