import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon, Trash2Icon, UserCogIcon } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Confirm } from '@/components/confirm';
import { NewAliasDialog } from '@/components/new-alias-dialog';
import { IconTip } from '@/components/page-header';
import { UserPicker } from '@/components/user-picker';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type AdminAlias, api } from '@/lib/api';
import { fullDate, relativeTime } from '@/lib/format';
import { AdminPage } from './page';

const aliasesKey = ['admin', 'aliases'];

export default function Aliases() {
  const qc = useQueryClient();
  const aliases = useQuery({ queryKey: aliasesKey, queryFn: api.admin.aliases, select: (d) => d.aliases });
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminAlias | null>(null);

  const remove = useMutation({
    mutationFn: (address: string) => api.deleteAlias(address),
    onSuccess: (_, address) => {
      toast.success(`Deleted ${address}`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['aliases'] });
      void qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const f = filter.trim().toLowerCase();
  const rows = (aliases.data ?? []).filter(
    (a) =>
      !f ||
      a.address.includes(f) ||
      a.createdByName?.toLowerCase().includes(f) ||
      a.users.some((u) => (u.name ?? u.id).toLowerCase().includes(f)),
  );

  return (
    <AdminPage
      title="Aliases"
      subtitle="Every address and who can read it"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <PlusIcon />
          <span className="hidden sm:inline">New alias</span>
          <span className="sr-only sm:hidden">New alias</span>
        </Button>
      }
    >
      <div className="relative mb-4 max-w-sm">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by address or user"
          aria-label="Filter aliases"
          className="pl-8"
        />
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-3 sm:pl-4">Address</TableHead>
              <TableHead className="hidden md:table-cell">Created by</TableHead>
              <TableHead className="hidden text-right md:table-cell">Messages</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="w-20 pr-2 sm:pr-4">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aliases.isPending &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4" colSpan={5}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            {aliases.isError && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-destructive">
                  Couldn't load aliases: {aliases.error.message}
                </TableCell>
              </TableRow>
            )}
            {aliases.isSuccess && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {f ? `No aliases match “${filter.trim()}”.` : 'No aliases yet.'}
                </TableCell>
              </TableRow>
            )}
            {rows.map((a) => (
              <TableRow key={a.address}>
                <TableCell className="pl-3 whitespace-normal sm:pl-4">
                  <Link
                    to={`/a/${encodeURIComponent(a.address)}`}
                    className="font-medium break-all underline-offset-4 outline-none hover:underline focus-visible:underline"
                  >
                    {a.address}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    <time dateTime={new Date(a.createdAt).toISOString()} title={fullDate(a.createdAt)}>
                      Created {relativeTime(a.createdAt)}
                    </time>
                    <span className="md:hidden">
                      {' '}
                      by {a.createdByName ?? a.createdBy} · {a.messageCount} message{a.messageCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-40 truncate md:table-cell">
                  {a.createdByName ?? <span className="font-mono text-xs">{a.createdBy}</span>}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{a.messageCount}</TableCell>
                <TableCell>
                  <div className="flex max-w-72 min-w-24 flex-wrap gap-1">
                    {a.users.length ? (
                      a.users.map((u) => (
                        <Badge key={u.id} variant="secondary" className="max-w-36 truncate">
                          {u.name ?? u.id}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">Admins only</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="pr-2 sm:pr-4">
                  <div className="flex justify-end gap-0.5">
                    <IconTip label="Manage access">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(a)}
                        aria-label={`Manage access to ${a.address}`}
                      >
                        <UserCogIcon />
                      </Button>
                    </IconTip>
                    <Confirm
                      title={`Delete ${a.address}?`}
                      description={`The alias and its ${a.messageCount} message${a.messageCount === 1 ? '' : 's'} are deleted permanently.`}
                      action="Delete alias"
                      onConfirm={() => remove.mutate(a.address)}
                    >
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${a.address}`}>
                        <Trash2Icon />
                      </Button>
                    </Confirm>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <NewAliasDialog open={creating} onOpenChange={setCreating} navigateOnCreate={false} />
      {editing && <AccessDialog alias={editing} onClose={() => setEditing(null)} />}
    </AdminPage>
  );
}

function AccessDialog({ alias, onClose }: { alias: AdminAlias; onClose: () => void }) {
  const qc = useQueryClient();
  const [ids, setIds] = useState(() => alias.users.map((u) => u.id));
  const save = useMutation({
    mutationFn: () => api.admin.setAccess(alias.address, ids),
    onSuccess: () => {
      toast.success(`Updated access to ${alias.address}`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage access</DialogTitle>
          <DialogDescription className="break-all">
            Choose who can read <span className="font-medium text-foreground">{alias.address}</span>. Admins and see-all
            users always can.
          </DialogDescription>
        </DialogHeader>
        <UserPicker value={ids} onChange={setIds} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : `Save (${ids.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
