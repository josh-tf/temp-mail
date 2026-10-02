import { useEffect } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { api, type Me } from './api';

export const POLL_MS = 10_000;

export const meQuery = queryOptions({ queryKey: ['me'], queryFn: api.me, staleTime: 60_000 });
export const aliasesQuery = queryOptions({
  queryKey: ['aliases'],
  queryFn: api.aliases,
  select: (d) => d.aliases,
  refetchInterval: POLL_MS,
});
export const adminUsersQuery = queryOptions({
  queryKey: ['admin', 'users'],
  queryFn: api.admin.users,
  select: (d) => d.users,
});

/** Only valid below AppShell, which renders nothing until /api/me has loaded. */
export const useMe = () => useQuery(meQuery).data as Me;

export const canDeleteAlias = (me: Me, createdBy: string) => me.isAdmin || (me.canCreate && createdBy === me.id);

export function useTitle(title: string | undefined) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · temp mail` : 'temp mail';
    return () => {
      document.title = prev;
    };
  }, [title]);
}
