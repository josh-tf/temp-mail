import { ShieldXIcon } from 'lucide-react';
import { Outlet } from 'react-router';
import { Empty } from '@/components/empty';
import { PageHeader } from '@/components/page-header';
import { useMe, useTitle } from '@/lib/queries';

/** Layout route for /admin/*: non-admins get a 403 state and the admin pages (and their queries) never mount. */
export function AdminGuard() {
  const me = useMe();
  return me.isAdmin ? <Outlet /> : <Forbidden />;
}

function Forbidden() {
  useTitle('Admin');
  return (
    <>
      <PageHeader title="Admin" />
      <Empty icon={ShieldXIcon} title="Admins only" className="flex-1">
        You don't have permission to view this page.
      </Empty>
    </>
  );
}

export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  useTitle(title === 'Overview' ? 'Admin' : `${title} · Admin`);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        {actions}
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">{children}</div>
      </div>
    </>
  );
}
