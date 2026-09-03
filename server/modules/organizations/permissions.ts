import type { OrganizationRole } from "./service";

export type OrganizationPermission =
  | "organization.manage"
  | "portfolio.write"
  | "lease.write"
  | "maintenance.write"
  | "finance.read"
  | "invoice.status.write"
  | "accounting.write"
  | "accounting.post"
  | "lab.write"
  | "lab.results.approve";

const permissions: Record<OrganizationRole, readonly OrganizationPermission[]> =
  {
    owner: [
      "organization.manage",
      "portfolio.write",
      "lease.write",
      "maintenance.write",
      "finance.read",
      "invoice.status.write",
      "accounting.write",
      "accounting.post",
      "lab.write",
      "lab.results.approve",
    ],
    manager: [
      "portfolio.write",
      "lease.write",
      "maintenance.write",
      "finance.read",
      "lab.write",
      "lab.results.approve",
    ],
    accountant: ["finance.read", "accounting.write", "accounting.post"],
    viewer: [],
  };

export function hasPermission(
  role: OrganizationRole,
  permission: OrganizationPermission
) {
  return permissions[role].includes(permission);
}
