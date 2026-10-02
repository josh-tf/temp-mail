# temp-mail

Private disposable email inboxes on Cloudflare Workers.

Mail for every address on your domain arrives through Cloudflare Email Routing (catch-all → this Worker). It is stored
in R2 (raw `.eml`) and D1 (metadata), and read through a React app behind Discord login. Admins decide who can sign
in, who can create aliases, and who sees which alias. Messages are deleted after a configurable number of days
(30 by default).

## Stack

- **Worker** (`src/`): Hono API, `email()` intake, daily retention cron
- **App** (`web/`): React, Vite, Tailwind, shadcn/ui, TanStack Query
- **Storage**: D1 (migrations in `migrations/`) and R2

## Develop

```sh
pnpm install && pnpm -C web install
cp wrangler.example.jsonc wrangler.jsonc   # fill in your account, domain and resource IDs
cp .dev.vars.example .dev.vars             # local secrets
pnpm db:migrate:local
pnpm dev                                   # builds the app, runs wrangler dev
pnpm check                                 # lint, format, typecheck, tests
pnpm format                                # fix formatting
```

`wrangler.jsonc` is gitignored. Set `WRANGLER` to use a different Wrangler binary for the scripts.

## Deploy

You need a domain on Cloudflare with Email Routing enabled, a D1 database, an R2 bucket and a Discord application
for login. Put their details in `wrangler.jsonc`.

Pushing to `main` runs CI and, if it passes, applies D1 migrations and deploys (`.github/workflows/ci.yml`). CI needs
two repo secrets: `CLOUDFLARE_API_TOKEN`, and `WRANGLER_JSONC` holding the full contents of your `wrangler.jsonc`.
`pnpm run deploy` builds and deploys by hand; it does not apply remote migrations.

Worker secrets (set once with `wrangler secret put`): `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`.

## License

[MIT](LICENSE)
