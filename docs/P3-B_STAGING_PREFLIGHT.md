# P3-B — Staging Database Preflight

Use `docs/p3b_staging_preflight.sql` on a staging database copy before applying migration `0004_security_integrity_settings.sql`.

## Purpose

Migration `0004` adds stricter integrity rules:

- one contractor per user
- one rental per apartment
- one sale per apartment
- user settings table
- foreign keys across user, contractor, apartment, rental, sale, maintenance, prediction, and notification records

The preflight SQL checks whether existing staging data can safely accept those constraints.

## How to run

1. Create a disposable database from the latest safe dump.
2. Record row counts for every application table.
3. Run `docs/p3b_staging_preflight.sql` against the disposable copy.
4. Review every result set.
5. Continue only if duplicate/orphan checks return zero rows.

## Green decision

Proceed to staging migration only when:

- duplicate contractors = 0
- duplicate rentals = 0
- duplicate sales = 0
- orphan contractors = 0
- orphan apartments = 0
- orphan rentals = 0
- orphan sales = 0
- orphan maintenance = 0
- orphan predictions = 0
- orphan notifications = 0
- `user_settings` does not already exist, or its structure has been manually verified

## Red decision

Stop if any query returns rows. Export the rows and prepare a targeted cleanup script before applying migration `0004`.

## Report template

```text
P3-B Preflight Result
Database: staging
Backup/dump taken: yes/no
user_settings exists before migration: yes/no
Duplicate contractors: 0/N
Duplicate rentals: 0/N
Duplicate sales: 0/N
Orphan contractors: 0/N
Orphan apartments: 0/N
Orphan rentals: 0/N
Orphan sales: 0/N
Orphan maintenance: 0/N
Orphan predictions: 0/N
Orphan notifications: 0/N
Decision: GREEN / RED
Notes:
```

## Next step after green result

Apply migration `0004_security_integrity_settings.sql` on the disposable
database, then run `docs/p3b_post_migration_validation.sql`. Require all
constraints to be present, every issue count to be zero, and the recorded
application-table row counts to be unchanged.

For local verification, `docs/p3b_red_fixture.sql` must produce a red preflight
and `docs/p3b_green_fixture.sql` must produce a green preflight before migration.
These fixtures are destructive test data and must never be run against staging
or production.
