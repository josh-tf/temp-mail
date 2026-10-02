import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, ClockIcon, DatabaseIcon, MailIcon, MailsIcon, UsersIcon, ZapIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { bytes } from '@/lib/format';
import { POLL_MS } from '@/lib/queries';
import { AdminPage } from './page';

const nf = new Intl.NumberFormat();

export default function Overview() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: api.admin.stats, refetchInterval: POLL_MS * 3 });
  const s = stats.data;
  const cards = [
    { label: 'Users', value: s && nf.format(s.users), icon: UsersIcon, to: '/admin/users' },
    { label: 'Aliases', value: s && nf.format(s.aliases), icon: MailsIcon, to: '/admin/aliases' },
    { label: 'Messages', value: s && nf.format(s.messages), icon: MailIcon },
    { label: 'Received in 24h', value: s && nf.format(s.messagesLast24h), icon: ZapIcon },
    { label: 'Storage', value: s && bytes(s.storageBytes), icon: DatabaseIcon },
    { label: 'Retention', value: s && `${s.retentionDays} days`, icon: ClockIcon },
  ];

  return (
    <AdminPage title="Overview" subtitle="System at a glance">
      {stats.isError ? (
        <p className="text-sm text-destructive">Couldn't load stats: {stats.error.message}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.label} size="sm" className="relative">
              <CardHeader>
                <CardDescription className="flex items-center justify-between">
                  {c.to ? (
                    <Link
                      to={c.to}
                      className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                    >
                      {c.label}
                    </Link>
                  ) : (
                    c.label
                  )}
                  <c.icon className="size-4" aria-hidden />
                </CardDescription>
                <CardTitle>
                  {c.value ? (
                    <span className="text-2xl font-semibold tabular-nums">{c.value}</span>
                  ) : (
                    <Skeleton className="h-8 w-20" />
                  )}
                </CardTitle>
              </CardHeader>
              {c.to && (
                <CardContent className="flex items-center gap-1 text-xs text-muted-foreground">
                  Manage <ArrowRightIcon className="size-3" aria-hidden />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
      {s && (
        <p className="mt-6 text-sm text-muted-foreground">
          Messages older than {s.retentionDays} days are deleted automatically each night.
        </p>
      )}
    </AdminPage>
  );
}
