import { useEffect, useState, type FormEvent } from 'react';
import { api, type ManagedUser } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';

export function FamilyManager({ open, embedded = false, actorId, onOpenChange = () => {} }: { open: boolean; embedded?: boolean; actorId: string; onOpenChange?(open: boolean): void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ManagedUser>();
  const [resetUser, setResetUser] = useState<ManagedUser>();
  const [resetError, setResetError] = useState('');

  async function refresh() {
    setLoading(true);
    try { setUsers((await api.users()).users); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load family accounts.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) queueMicrotask(() => { void refresh(); }); }, [open]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true);
    try { await api.createUser({ username: String(data.get('username') ?? '').trim(), password: String(data.get('password') ?? ''), role: data.get('role') === 'admin' ? 'admin' : 'member' }); form.reset(); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create account.'); }
    finally { setBusy(false); }
  }
  async function update(user: ManagedUser, change: { role?: 'admin' | 'member'; disabled?: boolean; password?: string }) {
    setBusy(true); try { await api.updateUser(user.id, change); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update account.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirmDelete) return; setBusy(true);
    try { await api.deleteUser(confirmDelete.id); setConfirmDelete(undefined); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete account.'); }
    finally { setBusy(false); }
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!resetUser) return; const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setBusy(true); setResetError('');
    try { await api.updateUser(resetUser.id, { password }); await refresh(); setResetUser(undefined); }
    catch (caught) { setResetError(caught instanceof Error ? caught.message : 'Could not reset password.'); }
    finally { setBusy(false); }
  }

  const confirmDialogs = <>
  <Modal open={Boolean(confirmDelete)} onOpenChange={(next) => { if (!next) setConfirmDelete(undefined); }}><ModalContent><ModalHeader><ModalTitle>Delete {confirmDelete?.username}?</ModalTitle><ModalDescription>The account and its watch history will be permanently removed.</ModalDescription></ModalHeader><ModalFooter><Button variant="outline" onClick={() => setConfirmDelete(undefined)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>Confirm delete</Button></ModalFooter></ModalContent></Modal>
  <Modal open={Boolean(resetUser)} onOpenChange={(next) => { if (!next) { setResetUser(undefined); setResetError(''); } }}><ModalContent><ModalHeader><ModalTitle>Reset {resetUser?.username}&apos;s password</ModalTitle><ModalDescription>This signs the account out on every device.</ModalDescription></ModalHeader>{resetError && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{resetError}</div>}<form onSubmit={reset}><Input name="password" label="New password" type="password" minLength={10} required disabled={busy}/><ModalFooter><Button variant="outline" type="button" onClick={() => { setResetUser(undefined); setResetError(''); }}>Cancel</Button><Button type="submit" disabled={busy}>Reset password</Button></ModalFooter></form></ModalContent></Modal>
  </>;

  const content = <>
    {error && <div role="alert" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
    <form className="space-y-3" onSubmit={create}><Input name="username" label="Username" required maxLength={64} disabled={busy}/><Input name="password" label="Temporary password" type="password" required minLength={10} disabled={busy}/>
      <label className="flex flex-col gap-1.5 text-sm font-medium">Role<select name="role" aria-label="Role" className="h-10 rounded-md border border-input bg-background px-3" disabled={busy}><option value="member">Member</option><option value="admin">Administrator</option></select></label>
      <Button type="submit" disabled={busy}>Add family member</Button></form>
    <section className="mt-6 border-t pt-4" aria-labelledby="family-accounts"><h2 id="family-accounts" className="font-semibold">Family accounts</h2>
      {loading ? <p role="status" className="mt-2 text-sm text-muted-foreground">Loading accounts…</p> : users.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No family accounts.</p> : <ul className="mt-2 space-y-2">{users.map((user) => <li key={user.id} className="rounded-md border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{user.username}{user.id === actorId ? ' (you)' : ''}</p><p className="text-xs text-muted-foreground">{user.role === 'admin' ? 'Administrator' : 'Member'} · {user.disabled ? 'Disabled' : 'Enabled'}</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || user.id === actorId} onClick={() => void update(user, { role: user.role === 'admin' ? 'member' : 'admin' })}>{user.role === 'admin' ? 'Make member' : 'Make admin'}</Button>
        <Button size="sm" variant="outline" disabled={busy || user.id === actorId} onClick={() => void update(user, { disabled: !user.disabled })}>{user.disabled ? 'Enable' : 'Disable'}</Button>
        <Button size="sm" variant="outline" disabled={busy || user.id === actorId} aria-describedby={user.id === actorId ? `self-reset-${user.id}` : undefined} onClick={() => { setResetError(''); setResetUser(user); }}>Reset password</Button><Button size="sm" variant="destructive" disabled={busy || user.id === actorId} onClick={() => setConfirmDelete(user)}>Delete</Button></div></div>
        {user.id === actorId && <p id={`self-reset-${user.id}`} className="mt-2 text-xs text-muted-foreground">Your own password cannot be reset from family management.</p>}
      </li>)}</ul>}</section>
  </>;

  if (embedded) return <section aria-label="Manage family" className="w-full max-w-2xl">{content}{confirmDialogs}</section>;
  return <Modal open={open} onOpenChange={onOpenChange}><ModalContent aria-describedby="family-description" className="max-h-[90vh] overflow-y-auto">
    <ModalHeader><ModalTitle className="text-xl font-semibold">Manage family</ModalTitle><ModalDescription id="family-description">Create accounts and control access to this Dose library.</ModalDescription></ModalHeader>
    {content}
  </ModalContent>
  {confirmDialogs}
  </Modal>;
}
