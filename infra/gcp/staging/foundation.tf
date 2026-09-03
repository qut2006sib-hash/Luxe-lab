resource "terraform_data" "foundation_approval" {
  input = "staging-foundation-approval"

  lifecycle {
    precondition {
      condition     = var.approve_foundation_provisioning
      error_message = "Foundation provisioning is blocked until a separate approval sets approve_foundation_provisioning=true."
    }
  }
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false

  depends_on = [terraform_data.foundation_approval]
}

resource "google_compute_network" "staging" {
  project                 = var.project_id
  name                    = "${var.name_prefix}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"

  depends_on = [google_project_service.required["compute.googleapis.com"]]

}

resource "google_compute_subnetwork" "cloud_run" {
  project                  = var.project_id
  name                     = "${var.name_prefix}-run"
  region                   = var.region
  network                  = google_compute_network.staging.id
  ip_cidr_range            = "10.42.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  project       = var.project_id
  name          = "${var.name_prefix}-private-services"
  address_type  = "INTERNAL"
  purpose       = "VPC_PEERING"
  prefix_length = 16
  network       = google_compute_network.staging.id

  depends_on = [
    google_project_service.required["servicenetworking.googleapis.com"],
  ]
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.staging.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

resource "google_artifact_registry_repository" "staging" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.name_prefix}-containers"
  description   = "Digest-pinned Staging application images"
  format        = "DOCKER"
  labels        = local.labels

  cleanup_policy_dry_run = true

  depends_on = [
    google_project_service.required["artifactregistry.googleapis.com"],
  ]
}

resource "google_service_account" "workload" {
  for_each = local.service_accounts

  project      = var.project_id
  account_id   = "${var.name_prefix}-${each.key}"
  display_name = "${var.name_prefix} ${each.value}"

  depends_on = [google_project_service.required["iam.googleapis.com"]]
}

resource "google_project_iam_member" "cloud_sql_client" {
  for_each = google_service_account.workload

  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${each.value.email}"
}

resource "google_sql_database_instance" "staging" {
  project          = var.project_id
  name             = "${var.name_prefix}-mysql"
  region           = var.region
  database_version = "MYSQL_8_4"

  deletion_protection = true

  settings {
    tier                        = var.database_tier
    edition                     = "ENTERPRISE"
    availability_type           = "ZONAL"
    deletion_protection_enabled = true
    connector_enforcement       = "REQUIRED"
    data_api_access             = "DISALLOW_DATA_API"
    disk_type                   = "PD_SSD"
    disk_size                   = var.database_disk_size_gb
    disk_autoresize             = true
    disk_autoresize_limit       = 50
    retain_backups_on_delete    = true
    user_labels                 = local.labels

    backup_configuration {
      enabled                        = true
      binary_log_enabled             = true
      start_time                     = "02:00"
      location                       = var.region
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    final_backup_config {
      enabled        = true
      retention_days = 30
    }

    maintenance_window {
      day          = 7
      hour         = 3
      update_track = "stable"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.staging.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
  }

  depends_on = [
    google_project_service.required["sqladmin.googleapis.com"],
    google_service_networking_connection.private_services,
  ]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_database" "application" {
  project   = var.project_id
  name      = "luxe_staging"
  instance  = google_sql_database_instance.staging.name
  charset   = "utf8mb4"
  collation = "utf8mb4_unicode_ci"
}

resource "google_secret_manager_secret" "config" {
  for_each = local.secrets

  project             = var.project_id
  secret_id           = "${var.name_prefix}-${each.value}"
  deletion_protection = true
  labels              = local.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [
    google_project_service.required["secretmanager.googleapis.com"],
  ]
}

resource "google_secret_manager_secret_iam_member" "app" {
  for_each = local.app_secret_keys

  project   = var.project_id
  secret_id = google_secret_manager_secret.config[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.workload["app"].email}"
}

resource "google_secret_manager_secret_iam_member" "worker" {
  for_each = local.required_worker_secret_keys

  project   = var.project_id
  secret_id = google_secret_manager_secret.config[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.workload["worker"].email}"
}

resource "google_secret_manager_secret_iam_member" "migrate" {
  for_each = local.required_migration_secret_keys

  project   = var.project_id
  secret_id = google_secret_manager_secret.config[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.workload["migrate"].email}"
}
