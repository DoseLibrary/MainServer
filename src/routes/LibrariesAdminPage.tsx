import { useCallback, useEffect, useState } from 'react';
import { api, type Library } from '@/lib/api';
import { AdminShell } from './AdminShell';
import { LibraryManager } from './LibraryManager';

export function LibrariesAdminPage() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try { setLibraries((await api.libraries()).libraries); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load libraries.'); }
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return <AdminShell title="Libraries" description="Add folders mounted into this Dose server, scan them, and refresh metadata.">
    <LibraryManager open embedded libraries={libraries} onOpenChange={() => {}} onChanged={setLibraries} error={error} onError={(message) => setError(message || undefined)} />
  </AdminShell>;
}
