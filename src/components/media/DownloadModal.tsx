import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { api, type DownloadEstimate } from '@/lib/api';
import { formatBytes, startDownloads } from '@/lib/downloads';
import { isInstalledApp, storageBudget, supportsDownloads } from '@/lib/download-store';

interface DownloadModalProps {
  open: boolean;
  mediaItemId: string;
  title: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Commits to a download only after saying what it costs.
 *
 * For a season that means the total for every episode, checked against what the
 * device actually has free — the moment to find out something will not fit is
 * before forty minutes of encoding, not after.
 */
export function DownloadModal({ open, mediaItemId, title, onOpenChange }: DownloadModalProps) {
  const [profile, setProfile] = useState<'sd' | 'hd'>('sd');
  const [estimate, setEstimate] = useState<DownloadEstimate>();
  const [freeBytes, setFreeBytes] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async (next: 'sd' | 'hd') => {
    setError(undefined); setEstimate(undefined);
    try {
      const [sizes, budget] = await Promise.all([api.downloadEstimate(mediaItemId, next), storageBudget()]);
      setEstimate(sizes); setFreeBytes(budget.availableBytes);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not work out the size.'); }
  }, [mediaItemId]);

  useEffect(() => { if (open) queueMicrotask(() => { void load(profile); }); }, [open, profile, load]);

  const episodes = estimate?.items.length ?? 0;
  const fits = estimate && freeBytes != null ? estimate.totalBytes < freeBytes : true;

  async function start() {
    if (!estimate) return;
    setBusy(true); setError(undefined);
    try {
      await startDownloads(estimate.items.map((item) => item.id), profile);
      onOpenChange(false);
      window.location.assign('/downloads');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not start the download.'); }
    finally { setBusy(false); }
  }

  return <Modal open={open} onOpenChange={onOpenChange}>
    <ModalContent aria-describedby="download-description">
      <ModalHeader>
        <ModalTitle className="text-xl font-semibold">Download {title}</ModalTitle>
        <ModalDescription id="download-description">
          {episodes > 1 ? `${episodes} episodes, kept on this device until they expire.` : 'Kept on this device until it expires.'}
        </ModalDescription>
      </ModalHeader>

      {!supportsDownloads() ? (
        <p className="text-sm text-muted-foreground">This browser cannot store downloads.</p>
      ) : <>
        {!isInstalledApp() && (
          <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
            Add Dose to your Home Screen first, or the system will delete these files within about a week.
          </p>
        )}

        <div className="flex gap-2">
          {(['sd', 'hd'] as const).map((option) => (
            <button key={option} type="button" aria-pressed={profile === option} onClick={() => setProfile(option)}
              className={`flex-1 rounded-md border p-3 text-left transition-colors ${profile === option ? 'border-foreground bg-accent' : 'hover:bg-muted/50'}`}>
              <span className="block font-medium">{option === 'sd' ? '480p' : '720p'}</span>
              <span className="block text-xs text-muted-foreground">{option === 'sd' ? 'Smaller, fine on a phone' : 'Sharper, roughly twice the size'}</span>
            </button>
          ))}
        </div>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{episodes > 1 ? 'Total size' : 'Size'}</dt>
            <dd className="font-medium">{estimate ? formatBytes(estimate.totalBytes) : 'Working it out…'}</dd>
          </div>
          {freeBytes != null && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Free on this device</dt>
              <dd className={fits ? 'font-medium' : 'font-medium text-destructive'}>{formatBytes(freeBytes)}</dd>
            </div>
          )}
        </dl>

        {estimate && !fits && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            This will not fit. Free some space, or choose 480p{profile === 'sd' ? ' and fewer episodes' : ''}.
          </p>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </>}

      <ModalFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={busy || !estimate || !fits || !supportsDownloads()} onClick={() => void start()}>
          {busy ? 'Starting…' : episodes > 1 ? `Download ${episodes} episodes` : 'Download'}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>;
}
