import { useEffect, useRef } from 'react';
import { subscribeCatalogUpdates, subscribePluginUpdates } from './realtime';

/** Bursts are common (a scan emits ingested, then enriched); one refetch covers a burst. */
const SETTLE_MS = 1_000;

function useDebouncedSignal(subscribe: (fire: () => void) => () => void, refresh: () => void, enabled: boolean) {
  // The callback is read through a ref so a caller may pass an inline function
  // without re-subscribing (and reconnecting) on every render.
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), SETTLE_MS);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [subscribe, enabled]);
}

/** Refetch when the catalog changes on the server: new titles, removals, availability. */
export function useCatalogUpdates(refresh: () => void, enabled = true) {
  useDebouncedSignal(subscribeCatalogUpdates, refresh, enabled);
}

/** Refetch when any plugin starts or finishes a run, however it was triggered. */
export function usePluginUpdates(refresh: () => void, enabled = true) {
  useDebouncedSignal(subscribePluginUpdates, refresh, enabled);
}
