# Google Cloud Staging infrastructure

This Terraform root defines, but does not provision, an isolated Google Cloud
Staging environment. It contains no credentials, secret payloads, production
data, deployment trigger, or migration execution.

## Provisional region decision

The default is `europe-west12` (Turin). It was the fastest reviewed region from
the nearest publicly usable probe to Homs. `me-central2` (Dammam) was the
fastest Middle East region. The public probe was in Sidon, not Homs, so the
default is provisional and must be rechecked from a representative Homs
connection before any provisioning approval. See
[`REGION_ASSESSMENT.md`](./REGION_ASSESSMENT.md) and run:

```powershell
$report = Join-Path $env:TEMP "homs-gcp-latency-peak.json"
./scripts/Measure-GcpRegionLatency.ps1 `
  -ConfirmHomsNetwork `
  -Samples 20 `
  -AddressFamily IPv4 `
  -OutputPath $report
```

Do not run the measurement through a VPN, proxy, satellite link, or a network
that is not representative of pilot users. Capture peak and off-peak results
from each expected Homs ISP. Keep the generated JSON reports with the review;
they include raw timing, error, target-IP, protocol, and timestamp data but do
not query, store, or print the source public IP. A region change after real
measurements requires review because every regional resource must stay
co-located.

## Pre-provisioning eligibility gate

Users are primarily in Homs, so project ownership, billing eligibility, service
access from Syria, and the intended workload must be confirmed with Google
Cloud Billing or Sales before any account or resource work. Do not work around
country, billing, identity, or export-control restrictions. If Google cannot
confirm support under its current
[Cloud Terms](https://cloud.google.com/terms), stop and reassess the provider.
This gate requires no credentials in Git, Terraform, CI, or chat.

## Defined topology

- Cloud Run v2 Service: web application, zero to three instances.
- Cloud Run v2 Worker Pool: one continuously running worker instance.
- Cloud Run v2 Job: one task, no automatic retries, definition only.
- Cloud SQL for MySQL 8.4 Enterprise: zonal Staging instance, private IP only.
- Direct VPC egress: no Serverless VPC Access connector.
- Cloud SQL Auth Proxy v2 sidecars: private IP, connector enforcement, and
  encrypted authenticated database transport. The MySQL listener is loopback
  only; startup wrappers wait for proxy readiness without preview container
  ordering.
- Artifact Registry: co-located Docker repository for digest-pinned images.
- Secret Manager: region-pinned metadata and least-privilege IAM only.
  Terraform never accepts or creates a secret value.

The generic `docker-compose.managed.yml` remains the local validation contract.
It is not deployed to Cloud Run because the app, migration job, and Worker Pool
are separate managed resources.

## Deliberate release gates

Foundation approval, both workload gates, and public invocation default to
`false`:

1. Foundation: a plan/apply is rejected until a separately approved operator
   sets `approve_foundation_provisioning=true`. It then defines the network,
   Cloud SQL, Artifact Registry, service accounts, and empty Secret Manager
   resources only. Every Google resource depends on the same approval sentinel,
   so a targeted plan cannot bypass the gate.
2. Migration definition: set `enable_migration_job=true` only after database
   roles and numeric secret versions are bootstrapped through approved secure
   tooling.
3. Runtime: set `enable_runtime=true` only after preflight, migration execution,
   post-migration reconciliation, and migration-journal checks succeed. A
   separate protected release phase must verify that evidence before supplying
   `approve_runtime_release=true`. This boolean is explicit authorization, not
   proof: Terraform deliberately does not accept execution names, report hashes,
   or timestamps that could be fabricated inside a plan.

Terraform creates the migration Job definition but never executes it. A
resource dependency cannot prove that a Job execution completed. Execution is
a separate, audited release command and must exit zero before a runtime plan is
approved. The migration-definition phase must leave both `enable_runtime` and
`approve_runtime_release` false. `allow_unauthenticated_app` also defaults to
`false`; public invocation requires a separate Google OAuth callback and
exposure review.

## Offline validation only

These commands download the pinned provider but do not contact Google Cloud or
initialize a backend:

```bash
terraform -chdir=infra/gcp/staging fmt -check -recursive
terraform -chdir=infra/gcp/staging init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/gcp/staging validate -no-color
terraform -chdir=infra/gcp/staging test -no-color
```

Every native test uses `mock_provider "google"` and `command = plan`. CI must
never add an `apply` run. The omitted GCS backend settings, project credentials,
and secret payloads are supplied only after a separate provisioning approval.

## Secret and TLS contract

Do not put secret values in Terraform variables, `.tfvars`, state, Git, shell
history, CI output, or chat. A future secure bootstrap step creates versions
directly in Secret Manager. Terraform receives only positive numeric version
identifiers, never `latest`.

The app receives versioned values for `JWT_SECRET`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, and `AUTH_ALLOWED_EMAILS`. These values belong to
the Staging OAuth application only; do not reuse a production OAuth client or
allowlist. The app runs with `AUTH_MODE=google` and
`DEPLOYMENT_ENV=staging`.

The worker receives only the runtime database URL, SendGrid API key, and
SendGrid sender address. It runs with `EMAIL_DELIVERY_MODE=sendgrid` and
`DEPLOYMENT_ENV=staging`; it receives no JWT, Google OAuth, session, or email
allowlist value. Sentry is optional for the app: omit the `sentry_dsn` version
to keep the SDK completely disabled, or provide one reviewed Staging-only
version to enable it.

The configured Google redirect URI must exactly match the Staging Cloud Run
callback registered with Google. A callback mismatch, production OAuth value,
or broader-than-reviewed `AUTH_ALLOWED_EMAILS` value blocks runtime approval.

The runtime database URL must target the local Auth Proxy listener at
`127.0.0.1:3306`; the migration URL uses a separate database-scoped DDL/DML
role. MySQL 8.4 through Auth Proxy requires a client compatibility rehearsal,
including `allowPublicKeyRetrieval=true`. If the pinned mysql2 runtime cannot
meet that requirement, stop and open a separate reviewed application PR. Never
disable certificate or identity verification.

The proxy reaches Cloud SQL through private IP and supplies TLS with rotating
certificates. The future rehearsal must still verify an encrypted server
session and the exact least-privilege grants for both database roles.

## Recovery and known gaps

- Region-pinned backups, binary logs, seven-day transaction-log retention,
  retain-on-delete, a 30-day final backup, and two layers of deletion protection
  are defined. Before migration, also create an encrypted, timestamped logical
  backup with SHA-256 and prove restore into a different Cloud SQL instance.
  Provider backups alone do not supply the requested artifact checksum, so an
  independently verified backup remains mandatory before migration or teardown.
- Cloud Run revision rollback does not roll back the database. Restore/PITR
  always targets a different instance and requires an explicit cutover.
- The current worker has no HTTP or gRPC health endpoint. Staging health uses
  process survival, Worker Pool revision state, logs, and a synthetic job/outbox
  canary. A semantic probe requires a separate application PR.
- Cloud Run does not expose Docker Compose's read-only-root-filesystem control.
  The image remains non-root and the filesystem is ephemeral, but this is not
  exact hardening parity.
- The Google OAuth values are server-side runtime configuration. The reviewed
  image must not embed a Google client secret or an authorization allowlist.

Production remains blocked until the Homs measurement, synthetic Staging
rehearsal, TLS check, backup restore, migration reconciliation, Playwright flow,
idempotency checks, rollback rehearsal, and formal go/no-go decision all pass.
