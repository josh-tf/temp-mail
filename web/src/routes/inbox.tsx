import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InboxIcon, MailOpenIcon, SearchIcon, SearchXIcon, Trash2Icon, XIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Confirm } from '@/components/confirm';
import { Empty } from '@/components/empty';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, type MessageSummary } from '@/lib/api';
import { fullDate, senderName, shortTime } from '@/lib/format';
import { aliasesQuery, canDeleteAlias, POLL_MS, useMe, useTitle } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PAGE = 50;

/** Base path of the current mailbox: "" for all mail, "/a/<alias>" for one alias. */
export const mailboxBase = (alias: string | undefined) => (alias ? `/a/${encodeURIComponent(alias)}` : '');

export function Inbox() {
  const { alias, id } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  // Follow the URL when it changes from outside the box (sidebar links, back/forward).
  // After the debounce writes the URL, q === draft.trim(), so typing is never overwritten.
  useEffect(() => {
    if (q !== draft.trim()) setDraft(q);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce the search box into the URL so results are linkable and survive reloads.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() === q) return;
      setParams(
        (p) => {
          if (draft.trim()) p.set('q', draft.trim());
          else p.delete('q');
          return p;
        },
        { replace: true },
      );
    }, 250);
    return () => clearTimeout(t);
  }, [draft, q, setParams]);

  const aliases = useQuery(aliasesQuery);
  const current = alias ? aliases.data?.find((a) => a.address === alias) : undefined;
  const unknownAlias = !!alias && aliases.isSuccess && !current;
  useTitle(alias ?? 'All mail');

  const messages = useInfiniteQuery({
    queryKey: ['messages', alias ?? null, q],
    queryFn: ({ pageParam }) => api.messages({ alias, q: q || undefined, cursor: pageParam, limit: PAGE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // Polling refetches every loaded page; new mail only lands on page 1, so poll only then.
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 1) > 1 ? false : POLL_MS),
    enabled: !unknownAlias,
  });

  const deleteAlias = useMutation({
    mutationFn: () => api.deleteAlias(alias!),
    onSuccess: () => {
      toast.success(`Deleted ${alias}`);
      void qc.invalidateQueries({ queryKey: ['aliases'] });
      qc.removeQueries({ queryKey: ['messages', alias] });
      void navigate('/', { replace: true });
    },
  });

  const list = messages.data?.pages.flatMap((p) => p.messages) ?? [];
  const base = mailboxBase(alias);
  const search = q ? `?q=${encodeURIComponent(q)}` : '';

  return (
    <div className="flex min-h-0 flex-1">
      <section
        id="messages"
        tabIndex={-1}
        aria-label="Messages"
        className={cn(
          'flex min-w-0 flex-1 flex-col outline-none lg:max-w-md lg:flex-none lg:basis-[26rem] lg:border-r',
          id && 'hidden lg:flex',
        )}
      >
        <PageHeader
          title={alias ?? 'All mail'}
          subtitle={
            current
              ? `${current.messageCount} message${current.messageCount === 1 ? '' : 's'}`
              : !alias
                ? `${aliases.data?.length ?? 0} alias${aliases.data?.length === 1 ? '' : 'es'}`
                : undefined
          }
        >
          {current && <CopyButton value={current.address} label="Copy address" />}
          {current && canDeleteAlias(me, current.createdBy) && (
            <Confirm
              title={`Delete ${current.address}?`}
              description="The alias and all of its messages are deleted permanently. Mail sent to it afterwards is rejected."
              action="Delete alias"
              onConfirm={() => deleteAlias.mutate()}
            >
              <Button variant="ghost" size="icon-sm" aria-label="Delete alias" disabled={deleteAlias.isPending}>
                <Trash2Icon />
              </Button>
            </Confirm>
          )}
        </PageHeader>

        <div className="border-b p-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setDraft('')}
              placeholder="Search sender or subject"
              aria-label="Search messages"
              className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
            />
            {draft && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
                onClick={() => setDraft('')}
                aria-label="Clear search"
              >
                <XIcon />
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={messages.isPending}>
          {unknownAlias ? (
            <Empty icon={SearchXIcon} title="Alias not found">
              It may have been deleted, or you no longer have access.
            </Empty>
          ) : messages.isPending ? (
            <ListSkeleton />
          ) : messages.isError ? (
            <Empty icon={InboxIcon} title="Couldn't load messages">
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void messages.refetch()}>
                Try again
              </Button>
            </Empty>
          ) : list.length === 0 ? (
            q ? (
              <Empty icon={SearchXIcon} title="No matches">
                Nothing matches “{q}”.
              </Empty>
            ) : (
              <Empty icon={MailOpenIcon} title="No mail yet">
                {current ? (
                  <>
                    Messages sent to <span className="font-medium text-foreground">{current.address}</span> show up here
                    automatically.
                  </>
                ) : aliases.data?.length === 0 ? (
                  me.canCreate ? (
                    'Create an alias to start receiving mail.'
                  ) : (
                    'Ask an admin to share an alias with you.'
                  )
                ) : (
                  'New messages appear here automatically.'
                )}
              </Empty>
            )
          ) : (
            <>
              <ul className="divide-y">
                {list.map((m) => (
                  <li key={m.id}>
                    <MessageRow m={m} href={`${base}/m/${encodeURIComponent(m.id)}${search}`} showAlias={!alias} />
                  </li>
                ))}
              </ul>
              {messages.hasNextPage && (
                <div className="p-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void messages.fetchNextPage()}
                    disabled={messages.isFetchingNextPage}
                  >
                    {messages.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <div className={cn('min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden lg:flex')}>
        <Outlet />
      </div>
    </div>
  );
}

function MessageRow({ m, href, showAlias }: { m: MessageSummary; href: string; showAlias: boolean }) {
  return (
    <NavLink
      to={href}
      className={cn(
        'relative block px-4 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        'aria-[current=page]:bg-muted',
      )}
    >
      {!m.read && <span className="absolute top-[1.15rem] left-1.5 size-1.5 rounded-full bg-blue-500" aria-hidden />}
      <div className="flex items-baseline gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-sm', m.read ? 'text-foreground/80' : 'font-semibold')}>
          {senderName(m.from)}
          {!m.read && <span className="sr-only"> (unread)</span>}
        </span>
        <time
          dateTime={new Date(m.receivedAt).toISOString()}
          title={fullDate(m.receivedAt)}
          className={cn(
            'shrink-0 text-xs tabular-nums',
            m.read ? 'text-muted-foreground' : 'font-medium text-foreground',
          )}
        >
          {shortTime(m.receivedAt)}
        </time>
      </div>
      <div className={cn('truncate text-sm', m.read ? 'text-foreground/80' : 'font-medium')}>
        {m.subject || '(no subject)'}
      </div>
      {m.preview && <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">{m.preview}</p>}
      {showAlias && <p className="mt-1 truncate text-xs text-muted-foreground">to {m.address}</p>}
    </NavLink>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y" aria-label="Loading messages">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function NoMessageSelected() {
  return (
    <Empty icon={MailOpenIcon} title="No message selected" className="flex-1">
      Choose a message from the list to read it.
    </Empty>
  );
}
