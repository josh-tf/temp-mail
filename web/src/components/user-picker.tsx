import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Skeleton } from '@/components/ui/skeleton';
import { initials } from '@/lib/format';
import { adminUsersQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Searchable multi-select over all users (admin only). */
export function UserPicker({
  value,
  onChange,
  exclude,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  exclude?: (u: { isAdmin: boolean; seeAll: boolean }) => boolean;
}) {
  const users = useQuery(adminUsersQuery);
  const list = (users.data ?? []).filter((u) => !exclude?.(u));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Command className="rounded-lg border" aria-label="Users" label="Search users">
      <CommandInput placeholder="Search users…" />
      <CommandList className="max-h-56">
        {users.isPending ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {list.map((u) => {
                const on = value.includes(u.id);
                const name = u.name ?? u.id;
                return (
                  <CommandItem key={u.id} value={`${name} ${u.id}`} onSelect={() => toggle(u.id)} data-checked={on}>
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                        on && 'border-primary bg-primary text-primary-foreground',
                      )}
                      aria-hidden
                    >
                      {on && <CheckIcon className="size-3" />}
                    </span>
                    <Avatar size="sm">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt="" />}
                      <AvatarFallback>{initials(name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{name}</span>
                    <span className="sr-only">{on ? ', has access' : ', no access'}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">{u.id}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
