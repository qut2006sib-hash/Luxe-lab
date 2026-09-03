# Managed MySQL staging

This runbook is provider-neutral. It prepares a Docker-hosted `app` and
`worker` against an isolated managed MySQL database. It does not authorize a
production deployment or the use of production data.

## Provider gate

Choose a provider only after the managed-DB pull request is green. The selected
platform must provide:

- Docker workloads and immutable image digests;
- private connectivity between the Docker host and MySQL;
- a MySQL 8.4-compatible service with TLS, automated backups, and point-in-time
  recovery;
- a secret store, health monitoring, and image rollback.

Do not put credentials in Git, Compose files, shell history, or chat. Use
`.env.managed.example` only as the variable-name contract. The provider's
secret store must inject those values directly into the deployment process
environment; every command below assumes that injection is active.

Generate `JWT_SECRET` as the canonical unpadded base64url encoding of exactly
32 random bytes and store only the result in the provider secret store:

```bash
docker run --rm node:20-bookworm-slim node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Do not reuse documentation or CI values. The committed example stays blank;
the runtime rejects padded base64 and values that do not decode to exactly 32
bytes.

Every preseeded address that still needs its first Google identity link must be
either Gmail or a verified Google Workspace account with Google's nonempty `hd`
claim. Do not seed consumer Google accounts that use third-party email
addresses; their email verification is not authoritative for first linking.

## Images and database roles

Build the `runtime` and `migrate` Docker targets from the same reviewed commit,
publish both, and pin them by digest. Before deployment, require both values to
match `@sha256:` followed by exactly 64 lowercase hexadecimal characters:

```bash
set -eu
require_digest() {
  printf '%s\n' "$1" | grep -Eq '^.+@sha256:[0-9a-f]{64}$'
}
require_digest "$APP_IMAGE"
require_digest "$MIGRATE_IMAGE"
```

Do not continue if this preflight command fails. Local CI tags are permitted
only inside the disposable managed-database smoke test.

Use two database roles:

- `DATABASE_URL` is the long-lived runtime role and must not have schema-change
  privileges.
- `MIGRATION_DATABASE_URL` is a database-scoped DDL/DML role. Enable it only
  for a release and disable it after the migration and validation complete.

The two URLs may be identical only for an explicitly approved disposable
Staging environment. There is no implicit fallback between them.

Optional browser-visible `VITE_*` integration values are compiled into
`APP_IMAGE`. Google OAuth client configuration and the email allowlist are
server-side runtime values and must not be embedded in the browser bundle.

## TLS gate

For a provider certificate trusted by Node, append the URL-encoded
`?ssl=%7B%7D` option shown in `.env.managed.example`. Do not use
`rejectUnauthorized=false` or `ssl-mode=REQUIRED`; the latter is not a valid
mysql2 URL option.

Before migration, connect with mysql2 from the pinned runtime image and run
`SHOW SESSION STATUS LIKE 'Ssl_cipher'`. The cipher value must be non-empty. If
the provider requires a private CA that the current image cannot load, stop and
open a separate reviewed database/TLS configuration pull request.

## Synthetic Staging rehearsal

1. Provision an isolated database and the two scoped roles.
2. Enable private networking, TLS, backups, and point-in-time recovery.
3. Validate both image digests and the TLS cipher.
4. Load synthetic legacy fixtures only; do not copy production data.
5. Record the Drizzle migration journal. If migration `0004` is not already
   present, run `docs/p3b_staging_preflight.sql` before any migration and
   require every duplicate/orphan result and `issue_count` to be zero. A
   source database that fails this gate needs a separately reviewed data
   repair; do not add constraints over conflicting rows.
6. Run `docs/pilot_preflight.sql` and require every `blocking_*` value to be
   zero.
7. Run the one-shot migration and stop immediately if it fails:

   ```bash
   docker compose -f docker-compose.managed.yml \
     up --abort-on-container-exit --exit-code-from migrate migrate
   ```

8. If the source was pre-`0004`, run
   `docs/p3b_post_migration_validation.sql`. Then run
   `docs/pilot_post_migration_validation.sql`. Require every P3-B issue count
   and every `missing_*` value to be zero, and require every paired count and
   monetary total to reconcile.
9. Before browser sign-in, verify that each allowlisted lowercase email maps
   to exactly one preserved `users` row and that the user has an existing
   `organization_members` row. The address must be Gmail or a Google Workspace
   identity for which Google returns `hd`. Preseed this mapping only through a
   reviewed, auditable Staging data operation; the OAuth callback never creates
   a user, organization, or membership.
10. Disable the migration role, then start the runtime without rerunning its
    dependencies:

```bash
docker compose -f docker-compose.managed.yml up -d --no-deps app worker
```

11. Verify `/health/live`, `/health/ready`, worker health, migration history,
    application logs, the Playwright pilot flow, and invoice/notification
    idempotency. Migrated leases must remain non-billable until reconciled.

## Backup, restore, and rollback rehearsal

Real data remains prohibited until separately authorized. When authorization is
given, create an encrypted backup before migration, record the provider backup
ID, engine version, timestamp, and SHA-256 for any logical artifact, then prove
restoration into a different isolated database. A backup that has not been
restored successfully is not a rollback asset.

Record pre-migration counts, references, and monetary totals. Repeat the
preflight, migration, post-migration reconciliation, health, and browser gates
against the restored copy.

Retain the previous app and migration image digests. Before writes reopen, any
failed gate requires rollback to the previous image and restored backup. After
writes reopen, freeze writes and require an explicit choice between a restore
with its measured data-loss boundary and a reviewed fix-forward. Never
down-migrate, dual-write, or delete the preserved legacy tables during the
pilot.

Production remains blocked until the restore and rollback rehearsals pass,
their elapsed time and recovery point are recorded, and a formal go/no-go
decision is approved.
