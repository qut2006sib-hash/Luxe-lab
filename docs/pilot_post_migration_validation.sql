SELECT
  (SELECT COUNT(*) FROM contractors) AS legacy_contractors,
  (SELECT COUNT(*) FROM organizations WHERE legacyContractorId IS NOT NULL) AS migrated_organizations;

SELECT
  (SELECT COUNT(*) FROM apartments) AS legacy_apartments,
  (SELECT COUNT(*) FROM properties WHERE legacyApartmentId IS NOT NULL) AS migrated_properties,
  (SELECT COUNT(*) FROM units WHERE legacyApartmentId IS NOT NULL) AS migrated_units;

SELECT
  (SELECT COUNT(*) FROM rentals) AS legacy_rentals,
  (SELECT COUNT(*) FROM contacts WHERE legacyRentalId IS NOT NULL) AS migrated_contacts,
  (SELECT COUNT(*) FROM leases WHERE legacyRentalId IS NOT NULL) AS migrated_leases;

SELECT COUNT(*) AS missing_organization_members
FROM organizations o LEFT JOIN organization_members om ON om.organizationId = o.id AND om.role = 'owner'
WHERE om.id IS NULL;

SELECT COUNT(*) AS missing_unit_organization_links
FROM units u
LEFT JOIN organizations o ON o.id = u.organizationId
LEFT JOIN properties p ON p.id = u.propertyId AND p.organizationId = u.organizationId
WHERE o.id IS NULL OR p.id IS NULL;

SELECT COUNT(*) AS missing_lease_links
FROM leases l
LEFT JOIN units u ON u.id = l.unitId AND u.organizationId = l.organizationId
LEFT JOIN contacts c ON c.id = l.tenantContactId AND c.organizationId = l.organizationId
WHERE u.id IS NULL OR c.id IS NULL;

SELECT COUNT(*) AS missing_legacy_rental_audit_records
FROM leases l LEFT JOIN audit_log a
  ON a.organizationId = l.organizationId
 AND a.entityType = 'lease'
 AND a.entityId = l.id
 AND a.action = 'LEGACY_RENTAL_IMPORTED'
WHERE l.legacyRentalId IS NOT NULL AND a.id IS NULL;

SELECT COUNT(*) AS incomplete_legacy_rental_audit_metadata
FROM leases l JOIN audit_log a
  ON a.organizationId = l.organizationId
 AND a.entityType = 'lease'
 AND a.entityId = l.id
 AND a.action = 'LEGACY_RENTAL_IMPORTED'
WHERE l.legacyRentalId IS NOT NULL
  AND (JSON_EXTRACT(a.metadata, '$.id') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.apartmentId') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.tenantName') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.monthlyRent') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.rentPaid') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.waterBillPaid') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.electricityBillPaid') IS NULL
    OR JSON_EXTRACT(a.metadata, '$.startDate') IS NULL);

SELECT COUNT(*) AS missing_legacy_maintenance_status_events
FROM maintenance_requests mr LEFT JOIN maintenance_status_events mse
  ON mse.maintenanceRequestId = mr.id
WHERE mr.legacyMaintenanceId IS NOT NULL AND mse.id IS NULL;

SELECT COUNT(*) AS missing_legacy_source_links
FROM sales s WHERE s.organizationId IS NULL OR s.unitId IS NULL
UNION ALL
SELECT COUNT(*) FROM maintenance m WHERE m.organizationId IS NULL OR m.unitId IS NULL
UNION ALL
SELECT COUNT(*) FROM predictions p WHERE p.organizationId IS NULL OR p.unitId IS NULL
UNION ALL
SELECT COUNT(*) FROM notifications n WHERE n.organizationId IS NULL;

SELECT
  (SELECT COALESCE(SUM(monthlyRent), 0) FROM rentals) AS legacy_monthly_rent,
  (SELECT COALESCE(SUM(monthlyRent), 0) FROM leases WHERE legacyRentalId IS NOT NULL) AS migrated_monthly_rent;

SELECT
  (SELECT COALESCE(SUM(salePrice), 0) FROM sales) AS legacy_sale_value,
  (SELECT COALESCE(SUM(salePrice), 0) FROM sales WHERE organizationId IS NOT NULL AND unitId IS NOT NULL) AS linked_sale_value;

SELECT
  (SELECT COALESCE(SUM(cost), 0) FROM maintenance) AS legacy_maintenance_cost,
  (SELECT COALESCE(SUM(cost), 0) FROM maintenance_requests WHERE legacyMaintenanceId IS NOT NULL) AS migrated_maintenance_cost;

SELECT COUNT(*) AS wrongly_billable_unreconciled_legacy_leases
FROM leases l LEFT JOIN lease_reconciliations r ON r.leaseId = l.id
WHERE l.legacyRentalId IS NOT NULL AND r.id IS NULL AND l.billingEnabled = true;
