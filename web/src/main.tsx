import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError, errorMessage } from '@/lib/api';
import { AdminGuard } from '@/routes/admin/page';
import { AppShell, rememberReturnTo } from '@/routes/app-shell';
import { Inbox, NoMessageSelected } from '@/routes/inbox';
import { Login } from '@/routes/login';
import { MessageView } from '@/routes/message';
import { NotFound, RouteError } from '@/routes/errors';
import './index.css';

const inboxChildren = [
  { index: true, Component: NoMessageSelected },
  { path: 'm/:id', Component: MessageView },
];

const router = createBrowserRouter([
  { path: '/login', Component: Login },
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    HydrateFallback: () => null,
    children: [
      { Component: Inbox, children: inboxChildren },
      { path: 'a/:alias', Component: Inbox, children: inboxChildren },
      {
        path: 'admin',
        Component: AdminGuard,
        children: [
          { index: true, lazy: async () => ({ Component: (await import('@/routes/admin/overview')).default }) },
          { path: 'users', lazy: async () => ({ Component: (await import('@/routes/admin/users')).default }) },
          { path: 'aliases', lazy: async () => ({ Component: (await import('@/routes/admin/aliases')).default }) },
        ],
      },
      { path: '*', Component: NotFound },
    ],
  },
]);

function onUnauthorized(e: unknown) {
  if (e instanceof ApiError && e.status === 401 && router.state.location.pathname !== '/login') {
    rememberReturnTo();
    queryClient.clear();
    void router.navigate('/login', { replace: true });
    return true;
  }
  return false;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onUnauthorized }),
  mutationCache: new MutationCache({
    // Mutations surface their own errors as toasts unless they opt out with meta.silent.
    onError: (e, _v, _c, m) => {
      if (!onUnauthorized(e) && !m.meta?.silent) toast.error(errorMessage(e));
    },
  }),
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
