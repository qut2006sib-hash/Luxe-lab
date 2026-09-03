variable "project_id" {
  description = "Google Cloud project dedicated to Staging."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid Google Cloud project ID."
  }
}

variable "region" {
  description = "Region shared by Cloud Run, Cloud SQL, and Artifact Registry."
  type        = string
  default     = "europe-west12"

  validation {
    condition = contains([
      "europe-west12",
      "europe-west3",
      "me-central2",
      "me-central1",
    ], var.region)
    error_message = "Use one of the reviewed regions from the Homs latency assessment."
  }
}

variable "name_prefix" {
  description = "Prefix used for isolated Staging resources."
  type        = string
  default     = "luxe-staging"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.name_prefix))
    error_message = "name_prefix must be 3-22 lowercase letters, digits, or hyphens so derived service-account IDs remain valid."
  }
}

variable "approve_foundation_provisioning" {
  description = "Explicit approval gate for the first billable foundation apply. Keep false in committed configuration and CI."
  type        = bool
  default     = false
}

variable "app_image" {
  description = "Runtime image pinned by sha256 digest. Required only when runtime is enabled."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.app_image == null || can(regex("^.+@sha256:[0-9a-f]{64}$", var.app_image))
    error_message = "app_image must be an immutable @sha256 digest reference."
  }
}

variable "migrate_image" {
  description = "Migration image pinned by sha256 digest. Required only when the migration job is enabled."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.migrate_image == null || can(regex("^.+@sha256:[0-9a-f]{64}$", var.migrate_image))
    error_message = "migrate_image must be an immutable @sha256 digest reference."
  }
}

variable "cloud_sql_proxy_image" {
  description = "Reviewed Cloud SQL Auth Proxy v2 image pinned by sha256 digest."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.cloud_sql_proxy_image == null || can(regex("^.+@sha256:[0-9a-f]{64}$", var.cloud_sql_proxy_image))
    error_message = "cloud_sql_proxy_image must be an immutable @sha256 digest reference."
  }
}

variable "enable_migration_job" {
  description = "Creates the one-shot migration job definition after secure database bootstrap. It never executes the job."
  type        = bool
  default     = false
}

variable "enable_runtime" {
  description = "Creates app and worker only in the separately approved runtime release phase."
  type        = bool
  default     = false
}

variable "approve_runtime_release" {
  description = "Explicit approval for the protected runtime release phase. This is authorization only; Terraform does not treat it as proof that migration or validation succeeded."
  type        = bool
  default     = false
}

variable "allow_unauthenticated_app" {
  description = "Grants public Cloud Run invocation. Keep false until the Google OAuth callback and exposure review pass."
  type        = bool
  default     = false
}

variable "secret_versions" {
  description = "Numeric Secret Manager versions only. Secret values are never accepted by Terraform."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for version in values(var.secret_versions) : can(regex("^[1-9][0-9]*$", version))
    ])
    error_message = "Every secret version must be a positive numeric version, never latest."
  }
}

variable "database_tier" {
  description = "Dedicated Cloud SQL Enterprise tier used for migration rehearsal."
  type        = string
  default     = "db-custom-1-3840"
}

variable "database_disk_size_gb" {
  description = "Initial SSD size for the isolated Staging database."
  type        = number
  default     = 20

  validation {
    condition     = var.database_disk_size_gb >= 20 && var.database_disk_size_gb <= 50
    error_message = "Staging database_disk_size_gb must be between 20 and 50 GiB."
  }
}
