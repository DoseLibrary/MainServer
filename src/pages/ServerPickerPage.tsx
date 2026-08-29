import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export type ServerAvailability = 'online' | 'offline' | 'limited' | 'unknown';

export interface ServerPickerItem {
  id: string;
  name: string;
  address?: string;
  description?: string;
  status?: string;
  availability?: ServerAvailability;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export type ServerPickerState = 'loaded' | 'loading' | 'empty' | 'error';

export interface ServerPickerPageProps {
  servers?: readonly ServerPickerItem[];
  state?: ServerPickerState;
  title?: string;
  description?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onConnect?: () => void;
  onSelectServer?: (server: ServerPickerItem) => void;
  retryLabel?: string;
  connectLabel?: string;
  selectLabel?: string;
}

const availabilityStyles: Record<ServerAvailability, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-destructive',
  limited: 'bg-amber-500',
  unknown: 'bg-muted-foreground',
};

function LoadingGrid() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading content servers"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} className="flex min-h-64 flex-col">
          <CardHeader className="gap-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-full" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

interface MessageCardProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  role?: 'status' | 'alert';
}

function MessageCard({ title, message, actionLabel, onAction, role = 'status' }: MessageCardProps) {
  return (
    <Card className="mx-auto max-w-xl text-center" role={role}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {actionLabel && onAction ? (
        <CardFooter className="justify-center">
          <Button type="button" onClick={onAction}>
            {actionLabel}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function ServerPickerPage({
  servers = [],
  state = 'loaded',
  title = 'Choose a content server',
  description = 'Select the server whose library you want to browse.',
  errorMessage = 'We could not load your content servers. Please try again.',
  onRetry,
  onConnect,
  onSelectServer,
  retryLabel = 'Try again',
  connectLabel = 'Connect a server',
  selectLabel = 'Select server',
}: ServerPickerPageProps) {
  const resolvedState = state === 'loaded' && servers.length === 0 ? 'empty' : state;

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            DOSE
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">{description}</p>
        </header>

        {resolvedState === 'loading' ? <LoadingGrid /> : null}

        {resolvedState === 'error' ? (
          <MessageCard
            title="Servers unavailable"
            message={errorMessage}
            actionLabel={onRetry ? retryLabel : undefined}
            onAction={onRetry}
            role="alert"
          />
        ) : null}

        {resolvedState === 'empty' ? (
          <MessageCard
            title="No content servers yet"
            message="Connect a content server to start browsing its library."
            actionLabel={onConnect ? connectLabel : undefined}
            onAction={onConnect}
          />
        ) : null}

        {resolvedState === 'loaded' ? (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3" aria-label="Content servers">
            {servers.map((server) => {
              const availability = server.availability ?? 'unknown';
              const selection = server.onSelect ??
                (onSelectServer ? () => onSelectServer(server) : undefined);
              const actionText = `${selectLabel}: ${server.name}`;

              return (
                <li key={server.id} className="h-full">
                  <Card className="flex h-full min-h-64 flex-col transition-shadow hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="leading-snug">{server.name}</CardTitle>
                        {server.status ? (
                          <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full ${availabilityStyles[availability]}`}
                            />
                            {server.status}
                          </span>
                        ) : null}
                      </div>
                      {server.address ? (
                        <CardDescription className="break-all">{server.address}</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="flex-1">
                      {server.description ? (
                        <p className="text-sm leading-6 text-muted-foreground">{server.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Content server</p>
                      )}
                    </CardContent>
                    <CardFooter>
                      {server.href && !server.disabled ? (
                        <Button asChild className="w-full">
                          <a href={server.href} aria-label={actionText}>{selectLabel}</a>
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          disabled={server.disabled || !selection}
                          type="button"
                          aria-label={actionText}
                          onClick={selection}
                        >
                          {selectLabel}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
