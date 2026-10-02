import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { UserPicker } from '@/components/user-picker';
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
import { api, ApiError } from '@/lib/api';
import { ALIAS_RE } from '@/lib/format';
import { useMe } from '@/lib/queries';

export function NewAliasDialog({
  open,
  onOpenChange,
  navigateOnCreate = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  navigateOnCreate?: boolean;
}) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [local, setLocal] = useState('');
  const [grantTo, setGrantTo] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const invalid = local !== '' && !ALIAS_RE.test(local);
  const create = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      api.createAlias({ local: local || undefined, grantTo: me.isAdmin && grantTo.length ? grantTo : undefined }),
    onSuccess: ({ address }) => {
      void qc.invalidateQueries({ queryKey: ['aliases'] });
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast.success(`Created ${address}`, {
        action: { label: 'Copy', onClick: () => void navigator.clipboard.writeText(address).catch(() => {}) },
      });
      close(false);
      if (navigateOnCreate) void navigate(`/a/${encodeURIComponent(address)}`);
    },
    onError: (e) =>
      setServerError(e instanceof ApiError && e.status === 409 ? 'That address is already taken.' : e.message),
  });

  function close(o: boolean) {
    if (!o) {
      setLocal('');
      setGrantTo([]);
      setServerError(null);
      create.reset();
    }
    onOpenChange(o);
  }

  const error = invalid
    ? 'Use lowercase letters, digits, dots, dashes or underscores; start and end with a letter or digit.'
    : serverError;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid && !create.isPending) create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>New alias</DialogTitle>
            <DialogDescription>Pick an address, or leave it blank for a random one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="alias-local">Address</Label>
            <div
              className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 aria-invalid:border-destructive"
              aria-invalid={!!error}
            >
              <Input
                id="alias-local"
                value={local}
                onChange={(e) => {
                  setLocal(e.target.value.toLowerCase().trim());
                  setServerError(null);
                }}
                placeholder="random"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                aria-invalid={!!error}
                aria-describedby="alias-help"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                autoFocus
              />
              <span className="shrink-0 pr-3 text-sm text-muted-foreground select-none">@{me.domain}</span>
            </div>
            <p id="alias-help" className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {error ?? 'Mail to this address appears in your inbox within seconds.'}
            </p>
          </div>
          {me.isAdmin && (
            <div className="grid gap-2">
              <Label>Also give access to</Label>
              <UserPicker value={grantTo} onChange={setGrantTo} exclude={(u) => u.isAdmin || u.seeAll} />
              <p className="text-sm text-muted-foreground">Admins and see-all users can already read every alias.</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create alias'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
