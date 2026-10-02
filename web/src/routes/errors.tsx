import { FileQuestionIcon, TriangleAlertIcon } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Empty } from '@/components/empty';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useTitle } from '@/lib/queries';

export function NotFound() {
  useTitle('Not found');
  return (
    <>
      <PageHeader title="Not found" />
      <Empty icon={FileQuestionIcon} title="Page not found" className="flex-1">
        <p>There's nothing at this address.</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/">Go to inbox</Link>
        </Button>
      </Empty>
    </>
  );
}

/** Render errors and failed lazy chunks (e.g. after a deploy replaced the old assets). */
export function RouteError() {
  const error = useRouteError();
  useTitle('Error');
  const chunk = error instanceof Error && /dynamically imported module|Importing a module script/i.test(error.message);
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Empty icon={TriangleAlertIcon} title={chunk ? 'A new version is available' : 'Something went wrong'}>
        <p>
          {isRouteErrorResponse(error)
            ? `${error.status} ${error.statusText}`
            : chunk
              ? 'Reload to get the latest version.'
              : 'An unexpected error occurred.'}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Empty>
    </div>
  );
}
