# Pilot cutover

The `0005_pilot_domain_foundation` migration is additive. It keeps the legacy
contractor, apartment, rental, sale, maintenance, prediction, and notification
records while creating organization-scoped replacements.

Complete the synthetic Staging, TLS, backup-restore, and rollback gates in
`docs/MANAGED_MYSQL_STAGING.md` before scheduling a production maintenance
window. Record the source commit plus current and previous runtime and
migration image digests.

## Before the maintenance window

1. Stop application writes and record the current application commit.
2. Create an encrypted MySQL backup with the deployment platform's supported
   tooling, record its provider ID and metadata, and prove restoration into a
   separate database. Never treat an untested dump as a backup.
3. Record the Drizzle migration journal. If `0004` is absent, run
   `docs/p3b_staging_preflight.sql` before any migration and require every
   duplicate/orphan result and `issue_count` to be zero.
4. Run `docs/pilot_preflight.sql`; every `blocking_*` value must be zero.
5. Enable the scoped migration role and apply all committed migrations with
   the pinned one-shot `migrate` image. Do not start runtime services on
   failure.
6. If the source was pre-`0004`, run
   `docs/p3b_post_migration_validation.sql`. Then run
   `docs/pilot_post_migration_validation.sql`; every issue and `missing_*`
   value must be zero and every legacy/new count pair must match.
7. Verify that each lowercase Google allowlist email identifies exactly one
   preserved user with an existing organization membership. Preseed or repair
   that mapping only through a separately reviewed, auditable data operation;
   the OAuth callback must not create access.
8. Disable the migration role, start `app` and `worker`, then verify liveness,
   readiness, worker health, logs, migration history, and idempotency.

## Billing activation

Migrated leases have `billingEnabled=false`. An organization owner must open
each migrated active lease and confirm a cutover date plus either `SETTLED` or
one non-negative opening amount due. Only that lease becomes billable.

## Rollback boundary

The legacy tables remain available for read-only inspection. Roll back the app
only before accepting writes through the new APIs; after new writes begin,
restore the verified pre-cutover backup or fix forward. Do not dual-write or
delete legacy records during the pilot release.
