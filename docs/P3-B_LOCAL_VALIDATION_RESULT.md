# P3-B Local Database Validation Result

- Date: 2026-07-29
- Engine: MySQL 8.4 in a disposable Docker container
- Exposure: localhost only
- Data source: synthetic fixtures only; no staging or production data

## Red legacy database

Migrations `0000` through `0003` were applied before loading the intentionally
invalid fixture. The repaired preflight completed without querying the absent
`user_settings` table and reported:

| Check | Issues |
|---|---:|
| Duplicate contractors per user | 1 |
| Duplicate rentals per apartment | 1 |
| Duplicate sales per apartment | 1 |
| Orphan contractors | 1 |
| Orphan apartments | 1 |
| Orphan rentals | 1 |
| Orphan sales | 1 |
| Orphan maintenance | 1 |
| Orphan predictions | 1 |
| Orphan notifications | 1 |

Decision: **RED**, as expected. Migration `0004` was not applied.

## Green legacy database

The same legacy migrations were applied before loading the valid fixture.
Every preflight issue count was zero and `user_settings_table_count` was zero.

Migration `0004_security_integrity_settings.sql` then succeeded. Post-migration
validation confirmed:

- `user_settings` exists with 10 expected columns.
- All four unique constraints and eight foreign keys are present.
- Every duplicate and orphan issue count remains zero.
- Unique and foreign-key violations are rejected by MySQL.
- Application-table row counts were preserved exactly:

| Table | Before | After |
|---|---:|---:|
| users | 2 | 2 |
| contractors | 2 | 2 |
| apartments | 2 | 2 |
| rentals | 1 | 1 |
| sales | 1 | 1 |
| maintenance | 1 | 1 |
| predictions | 1 | 1 |
| notifications | 1 | 1 |

Decision: **GREEN**. The migration is safe for data with a green preflight.
