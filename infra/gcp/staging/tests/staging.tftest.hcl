mock_provider "google" {
  mock_resource "google_sql_database_instance" {
    defaults = {
      connection_name = "luxe-staging-123:europe-west12:luxe-staging-mysql"
    }
  }
}

run "foundation_requires_explicit_approval" {
  command = plan

  variables {
    project_id = "luxe-staging-123"
  }

  expect_failures = [terraform_data.foundation_approval]
}

run "targeted_foundation_plan_requires_explicit_approval" {
  command = plan

  plan_options {
    target = [google_project_service.required]
  }

  variables {
    project_id = "luxe-staging-123"
  }

  expect_failures = [terraform_data.foundation_approval]
}

run "foundation_is_private_and_recoverable" {
  command = plan

  variables {
    project_id                      = "luxe-staging-123"
    approve_foundation_provisioning = true
  }

  assert {
    condition     = google_sql_database_instance.staging.database_version == "MYSQL_8_4"
    error_message = "Cloud SQL must remain on MySQL 8.4."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].ip_configuration[0].ipv4_enabled == false
    error_message = "Cloud SQL must not expose a public IPv4 address."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].ip_configuration[0].ssl_mode == "ENCRYPTED_ONLY"
    error_message = "Cloud SQL must require encrypted transport."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].connector_enforcement == "REQUIRED"
    error_message = "Cloud SQL must require an approved connector."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].backup_configuration[0].enabled && google_sql_database_instance.staging.settings[0].backup_configuration[0].binary_log_enabled
    error_message = "Automated backups and binary logs must be enabled for PITR."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].backup_configuration[0].location == "europe-west12"
    error_message = "Automated backups must remain in the selected Staging region."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].retain_backups_on_delete
    error_message = "Cloud SQL backups must be retained after an approved instance deletion."
  }

  assert {
    condition     = google_sql_database_instance.staging.settings[0].final_backup_config[0].enabled && google_sql_database_instance.staging.settings[0].final_backup_config[0].retention_days == 30
    error_message = "Cloud SQL must create and retain a final backup for 30 days."
  }

  assert {
    condition     = google_sql_database_instance.staging.deletion_protection && google_sql_database_instance.staging.settings[0].deletion_protection_enabled
    error_message = "Terraform and API-level deletion protection must remain enabled."
  }

  assert {
    condition     = google_secret_manager_secret.config["jwt_secret"].replication[0].user_managed[0].replicas[0].location == "europe-west12"
    error_message = "Secret payloads must remain pinned to the selected Staging region."
  }

  assert {
    condition     = length(google_cloud_run_v2_job.migration) == 0 && length(google_cloud_run_v2_service.app) == 0 && length(google_cloud_run_v2_worker_pool.worker) == 0
    error_message = "Foundation planning must not create migration or runtime workloads by default."
  }
}

run "release_workloads_are_bounded" {
  command = plan

  variables {
    project_id                      = "luxe-staging-123"
    approve_foundation_provisioning = true
    approve_runtime_release         = true
    enable_migration_job            = true
    enable_runtime                  = true
    app_image                       = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    migrate_image                   = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/migrate@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    cloud_sql_proxy_image           = "gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    secret_versions = {
      runtime_database_url       = "1"
      migration_database_url     = "1"
      jwt_secret                 = "1"
      google_oauth_client_id     = "1"
      google_oauth_client_secret = "1"
      google_oauth_redirect_uri  = "1"
      auth_allowed_emails        = "1"
      sendgrid_api_key           = "1"
      sendgrid_from_email        = "1"
    }
  }

  assert {
    condition     = google_cloud_run_v2_service.app[0].template[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.app[0].template[0].scaling[0].max_instance_count == 3
    error_message = "Staging app scaling must remain bounded from zero to three instances."
  }

  assert {
    condition     = google_cloud_run_v2_worker_pool.worker[0].scaling[0].manual_instance_count == 1
    error_message = "Staging must use exactly one continuously billed worker instance."
  }

  assert {
    condition     = google_cloud_run_v2_job.migration[0].template[0].task_count == 1 && google_cloud_run_v2_job.migration[0].template[0].parallelism == 1
    error_message = "Migration must remain a single, serial task."
  }

  assert {
    condition     = google_cloud_run_v2_job.migration[0].template[0].template[0].max_retries == 0
    error_message = "Migration must never retry automatically."
  }

  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public_app) == 0
    error_message = "Public invocation must remain disabled unless separately approved."
  }


  assert {
    condition     = contains(google_cloud_run_v2_service.app[0].template[0].containers[1].args, "--address=127.0.0.1")
    error_message = "Cloud SQL Proxy database listeners must remain loopback-only."
  }

  assert {
    condition     = alltrue([for env in google_cloud_run_v2_service.app[0].template[0].containers[0].env : env.name != "PORT"])
    error_message = "Cloud Run must inject its reserved PORT variable from container_port."
  }

  assert {
    condition     = google_cloud_run_v2_service.app[0].template[0].containers[0].startup_probe[0].period_seconds * google_cloud_run_v2_service.app[0].template[0].containers[0].startup_probe[0].failure_threshold >= 90
    error_message = "The app startup probe must outlast the proxy readiness wait and Node bootstrap."
  }

  assert {
    condition = toset(keys(google_secret_manager_secret_iam_member.app)) == toset([
      "runtime_database_url",
      "jwt_secret",
      "google_oauth_client_id",
      "google_oauth_client_secret",
      "google_oauth_redirect_uri",
      "auth_allowed_emails",
    ])
    error_message = "The app must receive exactly its required database, session, Google OAuth, and allowlist values."
  }

  assert {
    condition = toset(keys(google_secret_manager_secret_iam_member.worker)) == toset([
      "runtime_database_url",
      "sendgrid_api_key",
      "sendgrid_from_email",
    ])
    error_message = "The worker must receive only its database and SendGrid values."
  }

  assert {
    condition = alltrue([
      for env in google_cloud_run_v2_worker_pool.worker[0].template[0].containers[0].env :
      !contains([
        "AUTH_MODE",
        "JWT_SECRET",
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "GOOGLE_OAUTH_REDIRECT_URI",
        "AUTH_ALLOWED_EMAILS",
      ], env.name)
    ])
    error_message = "The worker environment must not receive session, Google OAuth, or allowlist configuration."
  }

  assert {
    condition     = contains([for env in google_cloud_run_v2_service.app[0].template[0].containers[0].env : env.value if env.name == "AUTH_MODE"], "google")
    error_message = "The app must use the local Google OAuth mode."
  }

  assert {
    condition     = contains([for env in google_cloud_run_v2_worker_pool.worker[0].template[0].containers[0].env : env.value if env.name == "EMAIL_DELIVERY_MODE"], "sendgrid")
    error_message = "The worker must explicitly enable SendGrid delivery."
  }

  assert {
    condition = (
      contains([for env in google_cloud_run_v2_service.app[0].template[0].containers[0].env : env.value if env.name == "DEPLOYMENT_ENV"], "staging") &&
      contains([for env in google_cloud_run_v2_worker_pool.worker[0].template[0].containers[0].env : env.value if env.name == "DEPLOYMENT_ENV"], "staging")
    )
    error_message = "Both runtime processes must carry the static Staging safety marker."
  }

  assert {
    condition     = alltrue([for env in google_cloud_run_v2_service.app[0].template[0].containers[0].env : env.name != "SENTRY_DSN"])
    error_message = "Runtime must omit SENTRY_DSN when no optional version is configured."
  }
}

run "optional_sentry_is_app_only" {
  command = plan

  variables {
    project_id                      = "luxe-staging-123"
    approve_foundation_provisioning = true
    approve_runtime_release         = true
    enable_migration_job            = true
    enable_runtime                  = true
    app_image                       = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    migrate_image                   = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/migrate@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    cloud_sql_proxy_image           = "gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    secret_versions = {
      runtime_database_url       = "1"
      migration_database_url     = "1"
      jwt_secret                 = "1"
      google_oauth_client_id     = "1"
      google_oauth_client_secret = "1"
      google_oauth_redirect_uri  = "1"
      auth_allowed_emails        = "1"
      sentry_dsn                 = "1"
      sendgrid_api_key           = "1"
      sendgrid_from_email        = "1"
    }
  }

  assert {
    condition     = contains(keys(google_secret_manager_secret_iam_member.app), "sentry_dsn")
    error_message = "The app must receive access to the optional Sentry secret when a reviewed version is configured."
  }

  assert {
    condition     = contains([for env in google_cloud_run_v2_service.app[0].template[0].containers[0].env : env.name], "SENTRY_DSN")
    error_message = "The app must receive SENTRY_DSN when its optional version is configured."
  }

  assert {
    condition = (
      !contains(keys(google_secret_manager_secret_iam_member.worker), "sentry_dsn") &&
      alltrue([for env in google_cloud_run_v2_worker_pool.worker[0].template[0].containers[0].env : env.name != "SENTRY_DSN"])
    )
    error_message = "The optional Sentry secret must remain app-only."
  }
}

run "runtime_requires_separate_release_approval" {
  command = plan

  variables {
    project_id                      = "luxe-staging-123"
    approve_foundation_provisioning = true
    enable_migration_job            = true
    enable_runtime                  = true
    app_image                       = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    migrate_image                   = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/migrate@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    cloud_sql_proxy_image           = "gcr.io/cloud-sql-connectors/cloud-sql-proxy@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    secret_versions = {
      runtime_database_url       = "1"
      migration_database_url     = "1"
      jwt_secret                 = "1"
      google_oauth_client_id     = "1"
      google_oauth_client_secret = "1"
      google_oauth_redirect_uri  = "1"
      auth_allowed_emails        = "1"
      sentry_dsn                 = "1"
      sendgrid_api_key           = "1"
      sendgrid_from_email        = "1"
    }
  }

  expect_failures = [
    google_cloud_run_v2_service.app,
    google_cloud_run_v2_worker_pool.worker,
  ]
}

run "reject_mutable_runtime_image" {
  command = plan

  variables {
    project_id                      = "luxe-staging-123"
    approve_foundation_provisioning = true
    app_image                       = "europe-west12-docker.pkg.dev/luxe-staging-123/luxe/app:latest"
  }

  expect_failures = [var.app_image]
}
