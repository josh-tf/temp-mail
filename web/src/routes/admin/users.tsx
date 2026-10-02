import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockIcon, Trash2Icon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Confirm } from '@/components/confirm';
import { CopyButton } from '@/components/copy-button';
import { IconTip } from '@/components/page-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type AdminUser, api, ApiError, type UserFlags } from '@/lib/api';
import { DISCORD_ID_RE, fullDate, initials, relativeTime } from '@/lib/format';
import { adminUsersQuery, useMe } from '@/lib/queries';
import { AdminPage } from './page';

const FLAGS: { key: keyof UserFlags; label: string; help: string }[] = [
  { key: 'isAdmin', label: 'Admin', help: 'Full access, including this admin area' },
  { key: 'canCreate', label: 'Create', help: 'Can create aliases and delete their own' },
  { key: 'seeAll', label: 'See all', help: 'Can read every alias and message' },
];

export default function Users() {
  const me = useMe();
  const qc = useQueryClient();
  const users = useQuery(adminUsersQuery);
  const [adding, setAdding] = useState(false);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UserFlags> }) => api.admin.updateUser(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: adminUsersQuery.queryKey });
      qc.setQueryData(
        adminUsersQuery.queryKey,
        (d) => d && { users: d.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const remove = useMutation({
    mutationFn: (u: AdminUser) => api.admin.deleteUser(u.id),
    onSuccess: (_, u) => {
      toast.success(`Removed ${u.name ?? u.id}`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  return (
    <AdminPage
      title="Users"
      subtitle="Who can sign in, and what they can do"
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlusIcon />
          <span className="hidden sm:inline">Add user</span>
          <span className="sr-only sm:hidden">Add user</span>
        </Button>
      }
    >
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-3 sm:pl-4">User</TableHead>
              {FLAGS.map((f) => (
                <TableHead key={f.key} className="px-1 text-center sm:px-2">
                  <IconTip label={f.help}>
                    <button
                      type="button"
                      className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {f.label}
                    </button>
                  </IconTip>
                  <span id={`flag-help-${f.key}`} className="sr-only">
                    {f.help}
                  </span>
                </TableHead>
              ))}
              <TableHead className="hidden text-right md:table-cell">Aliases</TableHead>
              <TableHead className="hidden md:table-cell">Last login</TableHead>
              <TableHead className="w-10 pr-2 sm:pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4" colSpan={7}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            {users.isError && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-destructive">
                  Couldn't load users: {users.error.message}
                </TableCell>
              </TableRow>
            )}
            {users.data?.map((u) => {
              const name = u.name ?? 'Unnamed';
              const self = u.id === me.id;
              return (
                <TableRow key={u.id}>
                  <TableCell className="pl-3 sm:pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="hidden sm:flex">
                        {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                        <AvatarFallback>{initials(name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="max-w-28 truncate sm:max-w-44">{name}</span>
                          {self && <Badge variant="secondary">You</Badge>}
                          {u.permanentAdmin && (
                            <IconTip label="Permanent admin (set in ADMIN_IDS)">
                              <LockIcon className="size-3.5 text-muted-foreground" aria-label="Permanent admin" />
                            </IconTip>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 font-mono text-xs text-muted-foreground">
                          {u.id}
                          <span className="hidden sm:contents">
                            <CopyButton value={u.id} label="Copy Discord ID" size="icon-sm" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  {FLAGS.map((f) => {
                    const locked = f.key === 'isAdmin' && (u.permanentAdmin || self);
                    // Admin implies create + see all; show that rather than the dormant stored flag.
                    const implied = f.key !== 'isAdmin' && u.isAdmin;
                    return (
                      <TableCell key={f.key} className="px-1 text-center sm:px-2">
                        <Switch
                          checked={implied || u[f.key]}
                          disabled={locked || implied}
                          onCheckedChange={(v) => update.mutate({ id: u.id, patch: { [f.key]: v } })}
                          aria-label={`${f.label} for ${name}`}
                          aria-describedby={`flag-help-${f.key}`}
                          title={
                            implied
                              ? 'Included with admin'
                              : locked
                                ? u.permanentAdmin
                                  ? 'Permanent admin'
                                  : "You can't remove your own admin access"
                                : undefined
                          }
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{u.aliasCount}</TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    {u.lastLoginAt ? (
                      <time dateTime={new Date(u.lastLoginAt).toISOString()} title={fullDate(u.lastLoginAt)}>
                        {relativeTime(u.lastLoginAt)}
                      </time>
                    ) : (
                      'Never'
                    )}
                  </TableCell>
                  <TableCell className="pr-2 text-right sm:pr-4">
                    {!u.permanentAdmin && !self && (
                      <Confirm
                        title={`Remove ${name}?`}
                        description="They are signed out immediately and lose access to every alias. Aliases they created are kept."
                        action="Remove user"
                        onConfirm={() => remove.mutate(u)}
                      >
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}>
                          <Trash2Icon />
                        </Button>
                      </Confirm>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <AddUserDialog open={adding} onOpenChange={setAdding} />
    </AdminPage>
  );
}

const NO_FLAGS: UserFlags = { isAdmin: false, canCreate: true, seeAll: false };

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [flags, setFlags] = useState<UserFlags>(NO_FLAGS);
  const [error, setError] = useState<string | null>(null);
  const idInvalid = id !== '' && !DISCORD_ID_RE.test(id);

  function close(o: boolean) {
    if (!o) {
      setId('');
      setName('');
      setFlags(NO_FLAGS);
      setError(null);
    }
    onOpenChange(o);
  }

  const create = useMutation({
    meta: { silent: true },
    mutationFn: () => api.admin.createUser({ id, name: name.trim() || undefined, ...flags }),
    onSuccess: () => {
      toast.success(`Added ${name.trim() || id}`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      close(false);
    },
    onError: (e) => setError(e instanceof ApiError && e.status === 409 ? 'That user already exists.' : e.message),
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (DISCORD_ID_RE.test(id) && !create.isPending) create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              They can sign in with Discord once added. Their name and avatar update from Discord on first login.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="user-id">Discord ID</Label>
            <Input
              id="user-id"
              value={id}
              onChange={(e) => {
                setId(e.target.value.trim());
                setError(null);
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123456789012345678"
              aria-invalid={idInvalid || !!error}
              aria-describedby="user-id-help"
              className="font-mono"
              autoFocus
              required
            />
            <p
              id="user-id-help"
              className={idInvalid || error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
            >
              {idInvalid
                ? 'A Discord ID is 5–25 digits.'
                : (error ?? 'Shown to them on the sign-in page if they are not yet allowed in.')}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="user-name">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="off"
            />
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Permissions</legend>
            {FLAGS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`flag-${f.key}`} className="flex flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-xs text-muted-foreground">{f.help}</span>
                </Label>
                <Switch
                  id={`flag-${f.key}`}
                  checked={flags[f.key]}
                  onCheckedChange={(v) => setFlags((s) => ({ ...s, [f.key]: v }))}
                />
              </div>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!DISCORD_ID_RE.test(id) || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
