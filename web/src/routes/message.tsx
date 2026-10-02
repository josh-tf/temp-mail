import { useEffect, useState } from 'react';
import { type InfiniteData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  DownloadIcon,
  FileIcon,
  MailIcon,
  MailWarningIcon,
  PaperclipIcon,
  Trash2Icon,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Confirm } from '@/components/confirm';
import { IconTip } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError, type MessageSummary, urls } from '@/lib/api';
import { bytes, fullDate, initials, senderName } from '@/lib/format';
import { useTitle } from '@/lib/queries';
import { Empty } from '@/components/empty';
import { mailboxBase } from '@/routes/inbox';

type Page = { messages: MessageSummary[]; nextCursor: string | null };

/** The toolbar button that had focus unmounts on navigate; hand focus to the message list. */
const focusList = () => requestAnimationFrame(() => document.getElementById('messages')?.focus());

export function MessageView() {
  const { id, alias } = useParams() as { id: string; alias?: string };
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listHref = `${mailboxBase(alias) || '/'}${params.size ? `?${params}` : ''}`;

  // GET marks the message read server-side; it is not polled, so it never flips back.
  const msg = useQuery({ queryKey: ['message', id], queryFn: () => api.message(id), staleTime: Infinity });
  useTitle(msg.data ? msg.data.subject || '(no subject)' : undefined);

  // Patch this message in every cached list so the UI updates before the next poll.
  const patchLists = (fn: (m: MessageSummary) => MessageSummary | null) =>
    qc.setQueriesData<InfiniteData<Page>>(
      { queryKey: ['messages'] },
      (d) =>
        d && {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            messages: p.messages.flatMap((m) => (m.id === id ? (fn(m) ?? []) : m)),
          })),
        },
    );
  const setReadInLists = (read: boolean) => {
    patchLists((m) => ({ ...m, read }));
    void qc.invalidateQueries({ queryKey: ['aliases'] });
  };

  useEffect(() => {
    if (msg.data) setReadInLists(true);
  }, [msg.data?.id]);

  const markUnread = useMutation({
    mutationFn: () => api.setRead(id, false),
    onSuccess: () => {
      setReadInLists(false);
      qc.removeQueries({ queryKey: ['message', id] });
      toast.success('Marked as unread');
      void navigate(listHref);
      focusList();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteMessage(id),
    onSuccess: () => {
      toast.success('Message deleted');
      qc.removeQueries({ queryKey: ['message', id] });
      patchLists(() => null);
      void qc.invalidateQueries({ queryKey: ['aliases'] });
      void navigate(listHref, { replace: true });
      focusList();
    },
  });

  const back = (
    <IconTip label="Back to list">
      <Button variant="ghost" size="icon-sm" asChild className="lg:hidden">
        <Link to={listHref} aria-label="Back to list">
          <ArrowLeftIcon />
        </Link>
      </Button>
    </IconTip>
  );

  if (msg.isPending) {
    return (
      <div className="flex flex-1 flex-col" aria-busy="true" aria-label="Loading message">
        <div className="flex h-14 items-center gap-2 border-b px-3">{back}</div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-6 w-2/3" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  if (msg.isError) {
    const notFound = msg.error instanceof ApiError && (msg.error.status === 404 || msg.error.status === 403);
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-3">{back}</div>
        <Empty
          icon={MailWarningIcon}
          title={notFound ? 'Message not found' : "Couldn't load this message"}
          className="flex-1"
        >
          {notFound ? (
            'It may have been deleted or expired.'
          ) : (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void msg.refetch()}>
              Try again
            </Button>
          )}
        </Empty>
      </div>
    );
  }

  const m = msg.data;
  const sender = senderName(m.from);

  return (
    <article className="flex min-h-0 flex-1 flex-col" aria-labelledby="msg-subject">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
        {back}
        <div className="flex-1" />
        <IconTip label="Mark as unread">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => markUnread.mutate()}
            disabled={markUnread.isPending}
            aria-label="Mark as unread"
          >
            <MailIcon />
          </Button>
        </IconTip>
        <IconTip label="Download .eml">
          <Button variant="ghost" size="icon-sm" asChild>
            <a href={urls.raw(m.id)} download aria-label="Download .eml">
              <DownloadIcon />
            </a>
          </Button>
        </IconTip>
        <Confirm
          title="Delete this message?"
          description="It is removed permanently for everyone with access to this alias."
          onConfirm={() => remove.mutate()}
        >
          <Button variant="ghost" size="icon-sm" aria-label="Delete message" disabled={remove.isPending}>
            <Trash2Icon />
          </Button>
        </Confirm>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <header className="space-y-4 px-4 pt-4 pb-3 sm:px-6">
          <h1 id="msg-subject" className="text-lg font-semibold text-balance break-words">
            {m.subject || '(no subject)'}
          </h1>
          <div className="flex items-start gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
              aria-hidden
            >
              {initials(sender)}
            </div>
            <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-2 text-sm">
              <dt className="sr-only">From</dt>
              <dd className="col-span-2 truncate font-medium" title={m.from}>
                {m.from}
              </dd>
              <dt className="text-muted-foreground">To</dt>
              <dd className="truncate text-muted-foreground" title={m.to}>
                {m.to}
              </dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="text-muted-foreground">
                <time dateTime={new Date(m.receivedAt).toISOString()}>{fullDate(m.receivedAt)}</time>
                <span aria-hidden> · </span>
                {bytes(m.size)}
              </dd>
            </dl>
          </div>

          {m.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Attachments">
              {m.attachments.map((a) => (
                <li key={a.index}>
                  <a
                    href={urls.attachment(m.id, a.index)}
                    download
                    className="flex max-w-64 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{a.filename || `attachment-${a.index + 1}`}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{bytes(a.size)}</span>
                    <span className="sr-only">(download)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </header>

        <Body key={m.id} id={m.id} text={m.text} hasHtml={m.hasHtml} attachments={m.attachments.length} />
      </div>
    </article>
  );
}

function Body({
  id,
  text,
  hasHtml,
  attachments,
}: {
  id: string;
  text: string | null;
  hasHtml: boolean;
  attachments: number;
}) {
  const [view, setView] = useState<'html' | 'text'>(hasHtml ? 'html' : 'text');
  const hasText = !!text?.trim();

  if (!hasHtml && !hasText) {
    return (
      <Empty icon={attachments ? PaperclipIcon : MailWarningIcon} title="No readable body" className="flex-1 border-t">
        Download the .eml to see the original message.
      </Empty>
    );
  }

  return (
    <div className="flex min-h-[60svh] flex-1 flex-col border-t">
      {hasHtml && hasText && (
        <div className="flex justify-end px-4 pt-2 sm:px-6">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={view}
            onValueChange={(v) => v && setView(v as 'html' | 'text')}
            aria-label="Message format"
          >
            <ToggleGroupItem value="html">HTML</ToggleGroupItem>
            <ToggleGroupItem value="text">Plain text</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {view === 'html' && hasHtml ? (
        // Never add allow-same-origin or allow-scripts: the body is untrusted mail HTML.
        // The server also serves it with a sandbox CSP, so this is defence in depth.
        <iframe
          src={urls.body(id)}
          title="Message body"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          className="min-h-0 w-full flex-1 bg-white"
        />
      ) : (
        <pre className="flex-1 px-4 py-4 font-sans text-sm leading-relaxed break-words whitespace-pre-wrap sm:px-6">
          {text}
        </pre>
      )}
    </div>
  );
}
