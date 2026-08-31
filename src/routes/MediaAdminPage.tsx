import { AdminShell } from './AdminShell';
import { MediaAdmin } from './MediaAdmin';

export function MediaAdminPage() {
  return <AdminShell title="Media" description="Review titles, correct a mistaken match, or remove titles. Archived titles have no files on disk and are hidden from members." wide>
    <MediaAdmin open embedded />
  </AdminShell>;
}
