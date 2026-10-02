import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { meQuery } from '@/lib/queries';

function CloseMobileOnNavigate() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  return null;
}

const RETURN_KEY = 'returnTo';

/** Remembers the current path so the user lands back on it after signing in. */
export function rememberReturnTo() {
  const path = location.pathname + location.search;
  try {
    if (path !== '/' && path !== '/login') sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // storage unavailable: the user just lands on All mail
  }
}

function takeReturnTo() {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path?.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

export function AppShell() {
  const me = useQuery(meQuery);
  const navigate = useNavigate();
  useEffect(() => {
    if (!me.isSuccess) return;
    const path = takeReturnTo();
    if (path) void navigate(path, { replace: true });
  }, [me.isSuccess, navigate]);

  if (me.isPending) {
    return (
      <div className="flex h-svh" aria-busy="true" aria-label="Loading">
        <div className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-3 md:flex">
          <Skeleton className="h-10" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
        <div className="flex-1 space-y-3 p-4">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      rememberReturnTo();
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-muted-foreground">Couldn't reach the server.</p>
        <Button variant="outline" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <SidebarProvider className="h-svh">
      <CloseMobileOnNavigate />
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
