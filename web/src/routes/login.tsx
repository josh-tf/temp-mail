import { useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, ShieldAlertIcon } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router';
import { BrandMark, DiscordIcon } from '@/components/brand';
import { CopyButton } from '@/components/copy-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { urls } from '@/lib/api';
import { DISCORD_ID_RE } from '@/lib/format';
import { meQuery, useTitle } from '@/lib/queries';

export function Login() {
  useTitle('Log in');
  const [params] = useSearchParams();
  const me = useQuery({ ...meQuery, retry: false });
  if (me.data) return <Navigate to="/" replace />;

  const error = params.get('error');
  const id = params.get('id');
  const discordId = id && DISCORD_ID_RE.test(id) ? id : null;

  return (
    <main className="relative flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <BrandMark className="mx-auto mb-2 size-10" />
          <CardTitle>
            <h1 className="text-xl">temp mail</h1>
          </CardTitle>
          <CardDescription>Private disposable inboxes. Sign in to read your mail.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === 'unauthorised' ? (
            <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <ShieldAlertIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                You don't have access yet
              </div>
              <p className="mt-1 text-foreground/80">
                Send your Discord ID to the admin. Once they add you, sign in again.
              </p>
              {discordId && (
                <div className="mt-3 flex items-center gap-2 rounded-md border bg-background py-1 pr-1 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-sm">{discordId}</code>
                  <CopyButton value={discordId} label="Copy Discord ID" />
                </div>
              )}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
            >
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span>Sign-in didn't complete. Please try again.</span>
            </div>
          ) : null}
          <Button asChild size="lg" className="h-10 bg-[#5865F2] text-white hover:bg-[#4752c4]">
            <a href={urls.login}>
              <DiscordIcon className="size-5" />
              Continue with Discord
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
