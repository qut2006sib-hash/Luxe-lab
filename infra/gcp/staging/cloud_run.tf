resource "google_cloud_run_v2_job" "migration" {
  count = var.enable_migration_job ? 1 : 0

  project             = var.project_id
  name                = "${var.name_prefix}-migrate"
  location            = var.region
  deletion_protection = true
  labels              = local.labels

  template {
    parallelism = 1
    task_count  = 1

    template {
      service_account = google_service_account.workload["migrate"].email
      max_retries     = 0
      timeout         = "1800s"

      vpc_access {
        network_interfaces {
          network    = google_compute_network.staging.name
          subnetwork = google_compute_subnetwork.cloud_run.name
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        name    = "migrate"
        image   = local.migrate_image
        command = ["/bin/sh"]
        args = [
          "-c",
          <<-EOT
            set +e
            ${local.proxy_wait_command}
            migration_status=$?
            if [ "$migration_status" -eq 0 ]; then
              node node_modules/drizzle-kit/bin.cjs migrate
              migration_status=$?
            fi
            node -e "fetch('http://127.0.0.1:9091/quitquitquit',{method:'POST'}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
            proxy_status=$?
            if [ "$migration_status" -ne 0 ]; then
              exit "$migration_status"
            fi
            exit "$proxy_status"
          EOT
        ]

        dynamic "env" {
          for_each = local.migration_secret_env
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.config[env.value].secret_id
                version = lookup(var.secret_versions, env.value, "1")
              }
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }

      containers {
        name  = "cloud-sql-proxy"
        image = local.proxy_image
        args  = concat(slice(local.proxy_common_args, 0, length(local.proxy_common_args) - 1), ["--quitquitquit", "--admin-port=9091", google_sql_database_instance.staging.connection_name])

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }

        startup_probe {
          initial_delay_seconds = 1
          timeout_seconds       = 2
          period_seconds        = 2
          failure_threshold     = 30

          http_get {
            path = "/readiness"
            port = 9090
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.migrate_image != null && var.cloud_sql_proxy_image != null
      error_message = "Digest-pinned migrate_image and cloud_sql_proxy_image are required before enabling the migration job."
    }

    precondition {
      condition     = alltrue([for key in local.required_migration_secret_keys : contains(keys(var.secret_versions), key)])
      error_message = "Numeric versions for every migration secret are required before enabling the migration job."
    }
  }

  depends_on = [
    google_project_service.required["run.googleapis.com"],
    google_project_iam_member.cloud_sql_client,
    google_secret_manager_secret_iam_member.migrate,
  ]
}

resource "google_cloud_run_v2_service" "app" {
  count = var.enable_runtime ? 1 : 0

  project             = var.project_id
  name                = "${var.name_prefix}-app"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  labels              = local.labels

  template {
    service_account                  = google_service_account.workload["app"].email
    timeout                          = "60s"
    max_instance_request_concurrency = 20

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.staging.name
        subnetwork = google_compute_subnetwork.cloud_run.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      name    = "app"
      image   = local.app_image
      command = ["/bin/sh"]
      args = [
        "-c",
        "${local.proxy_wait_command} && exec node dist/index.js",
      ]

      ports {
        name           = "http1"
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "AUTH_MODE"
        value = "google"
      }

      env {
        name  = "DEPLOYMENT_ENV"
        value = "staging"
      }

      dynamic "env" {
        for_each = local.app_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.config[env.value].secret_id
              version = lookup(var.secret_versions, env.value, "1")
            }
          }
        }
      }

      env {
        name  = "SENTRY_ENVIRONMENT"
        value = "staging"
      }

      resources {
        cpu_idle          = true
        startup_cpu_boost = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 3
        period_seconds        = 3
        failure_threshold     = 35

        http_get {
          path = "/health/ready"
          port = 3000
        }
      }

      readiness_probe {
        timeout_seconds   = 3
        period_seconds    = 5
        failure_threshold = 3

        http_get {
          path = "/health/ready"
          port = 3000
        }
      }

      liveness_probe {
        initial_delay_seconds = 10
        timeout_seconds       = 3
        period_seconds        = 10
        failure_threshold     = 3

        http_get {
          path = "/health/live"
          port = 3000
        }
      }
    }

    containers {
      name  = "cloud-sql-proxy"
      image = local.proxy_image
      args  = local.proxy_common_args

      resources {
        cpu_idle = true
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 2
        failure_threshold     = 30

        http_get {
          path = "/readiness"
          port = 9090
        }
      }

      liveness_probe {
        timeout_seconds   = 2
        period_seconds    = 10
        failure_threshold = 3

        http_get {
          path = "/liveness"
          port = 9090
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    precondition {
      condition     = var.enable_migration_job
      error_message = "The migration job definition must remain enabled before runtime can be enabled."
    }

    precondition {
      condition     = var.app_image != null && var.cloud_sql_proxy_image != null
      error_message = "Digest-pinned app_image and cloud_sql_proxy_image are required before enabling runtime."
    }

    precondition {
      condition     = alltrue([for key in local.required_app_secret_keys : contains(keys(var.secret_versions), key)])
      error_message = "Numeric versions for every required app secret are required before enabling runtime."
    }

    precondition {
      condition     = var.approve_runtime_release
      error_message = "Runtime is blocked until the separate protected release phase sets approve_runtime_release=true after verifying migration and post-migration validation outside Terraform."
    }
  }

  depends_on = [
    google_project_service.required["run.googleapis.com"],
    google_project_iam_member.cloud_sql_client,
    google_secret_manager_secret_iam_member.app,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_app" {
  count = var.enable_runtime && var.allow_unauthenticated_app ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app[0].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_worker_pool" "worker" {
  count = var.enable_runtime ? 1 : 0

  project             = var.project_id
  name                = "${var.name_prefix}-worker"
  location            = var.region
  deletion_protection = true
  labels              = local.labels

  scaling {
    manual_instance_count = 1
  }

  template {
    service_account = google_service_account.workload["worker"].email

    vpc_access {
      network_interfaces {
        network    = google_compute_network.staging.name
        subnetwork = google_compute_subnetwork.cloud_run.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      name    = "worker"
      image   = local.app_image
      command = ["/bin/sh"]
      args = [
        "-c",
        "${local.proxy_wait_command} && exec node dist/worker.js",
      ]

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "DEPLOYMENT_ENV"
        value = "staging"
      }

      env {
        name  = "EMAIL_DELIVERY_MODE"
        value = "sendgrid"
      }

      dynamic "env" {
        for_each = local.worker_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.config[env.value].secret_id
              version = lookup(var.secret_versions, env.value, "1")
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    containers {
      name  = "cloud-sql-proxy"
      image = local.proxy_image
      args  = local.proxy_common_args

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        initial_delay_seconds = 1
        timeout_seconds       = 2
        period_seconds        = 2
        failure_threshold     = 30

        http_get {
          path = "/readiness"
          port = 9090
        }
      }

      liveness_probe {
        timeout_seconds   = 2
        period_seconds    = 10
        failure_threshold = 3

        http_get {
          path = "/liveness"
          port = 9090
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = var.enable_migration_job
      error_message = "The migration job definition must remain enabled before runtime can be enabled."
    }

    precondition {
      condition     = var.app_image != null && var.cloud_sql_proxy_image != null
      error_message = "Digest-pinned app_image and cloud_sql_proxy_image are required before enabling runtime."
    }

    precondition {
      condition     = alltrue([for key in local.required_worker_secret_keys : contains(keys(var.secret_versions), key)])
      error_message = "Numeric versions for every required worker and delivery secret are required before enabling runtime."
    }

    precondition {
      condition     = var.approve_runtime_release
      error_message = "Runtime is blocked until the separate protected release phase sets approve_runtime_release=true after verifying migration and post-migration validation outside Terraform."
    }
  }

  depends_on = [
    google_project_service.required["run.googleapis.com"],
    google_project_iam_member.cloud_sql_client,
    google_secret_manager_secret_iam_member.worker,
  ]
}
