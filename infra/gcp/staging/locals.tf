locals {
  labels = {
    application = "luxe-real-estate"
    environment = "staging"
    managed-by  = "terraform"
  }

  required_services = toset([
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
  ])

  service_accounts = {
    app     = "Application runtime"
    worker  = "Background worker"
    migrate = "One-shot migration"
  }

  secrets = {
    runtime_database_url       = "runtime-database-url"
    migration_database_url     = "migration-database-url"
    jwt_secret                 = "jwt-secret"
    google_oauth_client_id     = "google-oauth-client-id"
    google_oauth_client_secret = "google-oauth-client-secret"
    google_oauth_redirect_uri  = "google-oauth-redirect-uri"
    auth_allowed_emails        = "auth-allowed-emails"
    sendgrid_api_key           = "sendgrid-api-key"
    sendgrid_from_email        = "sendgrid-from-email"
    sentry_dsn                 = "sentry-dsn"
  }

  required_app_secret_env = {
    DATABASE_URL               = "runtime_database_url"
    JWT_SECRET                 = "jwt_secret"
    GOOGLE_OAUTH_CLIENT_ID     = "google_oauth_client_id"
    GOOGLE_OAUTH_CLIENT_SECRET = "google_oauth_client_secret"
    GOOGLE_OAUTH_REDIRECT_URI  = "google_oauth_redirect_uri"
    AUTH_ALLOWED_EMAILS        = "auth_allowed_emails"
  }

  optional_app_secret_env = contains(keys(var.secret_versions), "sentry_dsn") ? {
    SENTRY_DSN = "sentry_dsn"
  } : {}

  app_secret_env = merge(local.required_app_secret_env, local.optional_app_secret_env)

  # Authentication and session material is deliberately absent from the worker.
  worker_secret_env = {
    DATABASE_URL        = "runtime_database_url"
    SENDGRID_API_KEY    = "sendgrid_api_key"
    SENDGRID_FROM_EMAIL = "sendgrid_from_email"
  }

  migration_secret_env = {
    DATABASE_URL = "migration_database_url"
  }

  app_secret_keys             = toset(values(local.app_secret_env))
  required_app_secret_keys    = toset(values(local.required_app_secret_env))
  required_worker_secret_keys = toset(values(local.worker_secret_env))
  required_migration_secret_keys = toset(values(
    local.migration_secret_env
  ))

  placeholder_digest = "sha256:${join("", [for _ in range(64) : "0"])}"
  app_image          = coalesce(var.app_image, "invalid.invalid/app@${local.placeholder_digest}")
  migrate_image      = coalesce(var.migrate_image, "invalid.invalid/migrate@${local.placeholder_digest}")
  proxy_image        = coalesce(var.cloud_sql_proxy_image, "invalid.invalid/cloud-sql-proxy@${local.placeholder_digest}")

  proxy_common_args = [
    "--structured-logs",
    "--private-ip",
    "--address=127.0.0.1",
    "--port=3306",
    "--lazy-refresh",
    "--run-connection-test",
    "--health-check",
    "--http-address=0.0.0.0",
    "--http-port=9090",
    "--exit-zero-on-sigterm",
    google_sql_database_instance.staging.connection_name,
  ]

  proxy_wait_javascript = "const endpoint='http://127.0.0.1:9090/readiness';const deadline=Date.now()+60000;const wait=async()=>{while(Date.now()<deadline){try{const response=await fetch(endpoint);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}throw new Error('Cloud SQL Auth Proxy readiness timeout');};wait().catch(error=>{console.error(error.message);process.exit(1)});"
  proxy_wait_command    = "node -e \"${local.proxy_wait_javascript}\""
}
