output "selected_region" {
  description = "Provisionally selected region; remeasure from a real Homs connection before provisioning."
  value       = var.region
}

output "artifact_repository" {
  description = "Repository name for future digest-pinned images."
  value       = google_artifact_registry_repository.staging.name
}

output "cloud_sql_instance_connection_name" {
  description = "Non-secret instance identifier consumed by Auth Proxy sidecars."
  value       = google_sql_database_instance.staging.connection_name
}

output "app_uri" {
  description = "Cloud Run URI when runtime is explicitly enabled."
  value       = try(google_cloud_run_v2_service.app[0].uri, null)
}

output "release_gates" {
  description = "All provisioning and release gates intentionally default to false."
  value = {
    foundation_approved      = var.approve_foundation_provisioning
    migration_job_enabled    = var.enable_migration_job
    runtime_enabled          = var.enable_runtime
    runtime_release_approved = var.approve_runtime_release
    public_invocation        = var.allow_unauthenticated_app
  }
}
