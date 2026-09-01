import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Dices, Download, Film, History, LayoutDashboard, ListOrdered, ListVideo, LogOut, Puzzle, UserRound, UsersRound } from 'lucide-react';
import { api, type User } from '@/lib/api';
import { clearCache } from '@/lib/cache';
import { downloadQueue } from '@/lib/downloads';
import { RandomPickerModal } from '@/components/media/RandomPickerModal';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Avatar dropdown for the navbar: profile shortcuts, admin links, sign out.
 * Opens on click or keyboard activation. The account is fetched lazily on
 * first open so pages pay no extra request for the menu. */
export function UserMenu({ user: providedUser, onLogout }: { user?: User; onLogout?: () => void }) {
  const [fetchedUser, setFetchedUser] = useState<User>();
  const [open, setOpen] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const fetching = useRef(false);
  // The prop wins so a host page's fresher auth state is always reflected.
  const user = providedUser ?? fetchedUser;

  // Transfers still working, live from the device's own queue: starting a
  // download anywhere in the app shows up here without a reload.
  const [downloading, setDownloading] = useState(0);
  useEffect(() => {
    const queue = downloadQueue();
    if (!queue) return;
    return queue.subscribe((entries) => setDownloading(entries.filter((entry) => entry.status !== 'ready').length));
  }, []);

  function ensureUser() {
    if (user || fetching.current) return;
    fetching.current = true;
    void api.me().then(({ user: next }) => setFetchedUser(next)).catch(() => { fetching.current = false; });
  }

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
    <>
      <DropdownMenu open={open} onOpenChange={(next) => { if (next) ensureUser(); setOpen(next); }} modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={user ? `Account menu (${user.username})` : 'Account menu'}
            className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted text-sm font-semibold uppercase transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {user ? user.username.slice(0, 2) : <UserRound className="h-4 w-4" aria-hidden="true" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {!user ? <DropdownMenuLabel className="font-normal text-muted-foreground">Loading account…</DropdownMenuLabel> : <>
            <DropdownMenuLabel className="flex flex-col">
              <span>{user.username}</span>
              <span className="text-xs font-normal text-muted-foreground">{user.role === 'admin' ? 'Administrator' : 'Member'}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setRandomOpen(true)}><Dices className="mr-2 h-4 w-4" aria-hidden="true" />Random pick</DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/profile"><UserRound className="mr-2 h-4 w-4" aria-hidden="true" />Profile</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/profile/collections"><ListVideo className="mr-2 h-4 w-4" aria-hidden="true" />My Collections</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/profile/queue"><ListOrdered className="mr-2 h-4 w-4" aria-hidden="true" />Marathon queue</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/profile/history"><History className="mr-2 h-4 w-4" aria-hidden="true" />Watch history</a></DropdownMenuItem>
              <DropdownMenuItem asChild><a href="/downloads"><Download className="mr-2 h-4 w-4" aria-hidden="true" />Downloads{downloading > 0 && <span className="ml-2 rounded-full bg-foreground px-1.5 text-xs text-background">{downloading}</span>}</a></DropdownMenuItem>
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
      <RandomPickerModal open={randomOpen} onOpenChange={setRandomOpen} />
    </>
  );
}
