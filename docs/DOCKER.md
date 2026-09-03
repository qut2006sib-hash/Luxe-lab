# Docker

The supported local stack contains the production application, MySQL 8.4, a
one-shot Drizzle migration, an idempotent local-owner bootstrap, and the
background worker. It does not deploy anything or connect to an external
database.

## Fast laptop preview without Google credentials

For an Ubuntu/Linux laptop, copy the dedicated loopback-only configuration and
start the stack:

```bash
cp .env.local.example .env
docker compose up --build -d
curl --fail http://127.0.0.1:3000/health/ready
```

Open <http://127.0.0.1:3000>. The preview signs in the bootstrapped
`owner@example.com` user automatically. The server rejects this mode unless
`NODE_ENV=development` and `DEPLOYMENT_ENV=local`; the Compose port remains
bound to `127.0.0.1`. Never reuse this mode for Staging or production.

The committed `DEV_AUTH_OPEN_ID` matches the default
`LOCAL_OWNER_EMAIL=owner@example.com`. If that email changes, generate its
matching local identity with:

```bash
node -e "const {createHash}=require('node:crypto');const email=process.argv[1].toLowerCase();console.log('local-preseed:'+createHash('sha256').update(email).digest('hex').slice(0,48))" "new-owner@example.com"
```

Put the result in `DEV_AUTH_OPEN_ID`. Alternatively, use the Google OAuth
configuration below.

## Google OAuth setup

Create a Google OAuth web client and register this exact authorized redirect
URI:

```text
http://127.0.0.1:3000/api/auth/google/callback
```

Use `127.0.0.1`, not `localhost`, and keep the local host port at `3000` so the
browser origin matches the registered callback.

Copy `.env.docker.example` to `.env`, then set:

- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` from the local
  Google OAuth client;
- `JWT_SECRET` to the canonical unpadded base64url encoding of exactly 32
  random bytes;
- `AUTH_ALLOWED_EMAILS` to the comma-separated, lowercase Google accounts
  permitted to sign in;
- `LOCAL_OWNER_EMAIL` to one email in that allowlist; and
- the local organization name, phone, optional address, and currency.

For a first-time identity link, use either a Gmail account or a verified Google
Workspace account for which Google supplies a nonempty hosted-domain (`hd`)
claim. A consumer Google account backed by a third-party email is not accepted
for first linking even when Google reports that email as verified.

Generate a new `JWT_SECRET` instead of inventing or copying one:

```bash
docker run --rm node:20-bookworm-slim node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The output is 43 base64url characters without `=` padding. Put it only in the
uncommitted `.env`; the committed example stays blank, and the app rejects
padded base64 or values of any other decoded length.

The committed callback value must remain
`http://127.0.0.1:3000/api/auth/google/callback`. Do not commit `.env` or paste
the client secret into Git, CI logs, documentation, or chat.

## Start

Build and start the stack:

```bash
docker compose up --build -d
```

Compose waits for MySQL, runs `migrate`, then runs `bootstrap`, and starts the
app and worker only after both one-shot services exit successfully. Bootstrap
is safe to run again for the same configured local owner and organization.

Google OAuth settings are server-side runtime values; changing them does not
require rebuilding the browser bundle. The remaining optional `VITE_*`
integration, observability, and analytics values are build-time values and do
require `--build` when changed.

Local email delivery is deliberately set to `disabled`. The worker receives
only its database URL, deployment marker, and email-delivery mode. It never
receives Google OAuth credentials or `JWT_SECRET`.

LUXE Lab does not require a map integration or an external Maps credential.

## Inspect, verify, and stop

```bash
docker compose ps -a
docker compose logs -f app worker bootstrap migrate db
curl --fail http://127.0.0.1:3000/health/live
curl --fail http://127.0.0.1:3000/health/ready
docker compose down
```

`docker compose down` keeps the MySQL volume. To deliberately delete all local
Docker database data and start fresh:

```bash
docker compose down -v
```

The default database credentials are for private localhost use only. MySQL is
not published to the host by the standard stack, and the application is bound
to `127.0.0.1:3000` only. Changing credentials after MySQL initializes its
named volume does not change the stored database users; either restore the
matching values or delete only disposable local data with `down -v`.

The migration service uses Drizzle's migration journal and is safe to run
again. A migration or bootstrap failure prevents both runtime services from
starting. Do not point this Compose stack at a legacy, Staging, or production
database; use the reviewed integrity preflight and cutover workflow for legacy
data.

## Managed MySQL staging

`docker-compose.managed.yml` is the provider-neutral variant for externally
managed MySQL. It contains only the one-shot migration, app, and worker; local
owner bootstrap is intentionally absent. It requires immutable runtime and
migration images and does not create a database or volume.

The managed app receives Staging Google OAuth and JWT configuration. The
managed worker receives neither; it uses `EMAIL_DELIVERY_MODE=sendgrid` with
SendGrid credentials injected through the provider secret store. Follow
`docs/MANAGED_MYSQL_STAGING.md`; do not combine the managed file with the local
stack or supply production credentials before a provider is approved.

## Local integration tests

The MySQL integration suite deliberately refuses to run unless the database is
named `ci`. Starting only `db` still parses the complete Compose model, so
create `.env` as described above first. The test override publishes MySQL to
loopback port `3307`:

```bash
MYSQL_DATABASE=ci docker compose \
  --project-name luxe-integration \
  -f docker-compose.yml \
  -f docker-compose.test.yml \
  up -d db

DATABASE_URL=mysql://root:luxe_local_root_password@127.0.0.1:3307/ci \
  corepack pnpm exec drizzle-kit migrate

DATABASE_URL=mysql://root:luxe_local_root_password@127.0.0.1:3307/ci \
RUN_MYSQL_INTEGRATION=1 \
  corepack pnpm test
```

On PowerShell, set `MYSQL_DATABASE`, `DATABASE_URL`, and
`RUN_MYSQL_INTEGRATION` with `$env:NAME = "value"` before running the equivalent
commands. Remove only the disposable integration stack when finished:

```bash
docker compose \
  --project-name luxe-integration \
  -f docker-compose.yml \
  -f docker-compose.test.yml \
  down -v
```
