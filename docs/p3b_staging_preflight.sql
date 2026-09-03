-- P3-B Staging Database Preflight
-- Run this file on a staging database copy before applying migration 0004.
-- Every duplicate/orphan query should return zero rows before migration.

-- 1. Duplicate checks: these would violate UNIQUE constraints.

SELECT userId, COUNT(*) AS count
FROM contractors
GROUP BY userId
HAVING COUNT(*) > 1;

SELECT apartmentId, COUNT(*) AS count
FROM rentals
GROUP BY apartmentId
HAVING COUNT(*) > 1;

SELECT apartmentId, COUNT(*) AS count
FROM sales
GROUP BY apartmentId
HAVING COUNT(*) > 1;

-- 2. Foreign key/orphan checks.

SELECT c.id, c.userId
FROM contractors c
LEFT JOIN users u ON c.userId = u.id
WHERE u.id IS NULL AND c.userId IS NOT NULL;

SELECT a.id, a.contractorId
FROM apartments a
LEFT JOIN contractors c ON a.contractorId = c.id
WHERE c.id IS NULL AND a.contractorId IS NOT NULL;

SELECT 'rental' AS type, id, apartmentId FROM rentals WHERE apartmentId NOT IN (SELECT id FROM apartments)
UNION ALL
SELECT 'sale' AS type, id, apartmentId FROM sales WHERE apartmentId NOT IN (SELECT id FROM apartments)
UNION ALL
SELECT 'maintenance' AS type, id, apartmentId FROM maintenance WHERE apartmentId NOT IN (SELECT id FROM apartments)
UNION ALL
SELECT 'prediction' AS type, id, apartmentId FROM predictions WHERE apartmentId NOT IN (SELECT id FROM apartments);

SELECT n.id, n.contractorId
FROM notifications n
LEFT JOIN contractors c ON n.contractorId = c.id
WHERE c.id IS NULL AND n.contractorId IS NOT NULL;

-- 3. Structural checks.

SELECT COUNT(*) AS user_settings_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'user_settings';

-- 4. Summary counts. All issue_count values should be 0 before migration.

SELECT 'duplicate_contractors_per_user' AS check_name, COUNT(*) AS issue_count
FROM (SELECT userId FROM contractors GROUP BY userId HAVING COUNT(*) > 1) x
UNION ALL
SELECT 'duplicate_rentals_per_apartment', COUNT(*)
FROM (SELECT apartmentId FROM rentals GROUP BY apartmentId HAVING COUNT(*) > 1) x
UNION ALL
SELECT 'duplicate_sales_per_apartment', COUNT(*)
FROM (SELECT apartmentId FROM sales GROUP BY apartmentId HAVING COUNT(*) > 1) x
UNION ALL
SELECT 'orphan_contractors', COUNT(*)
FROM contractors c LEFT JOIN users u ON c.userId = u.id
WHERE u.id IS NULL AND c.userId IS NOT NULL
UNION ALL
SELECT 'orphan_apartments', COUNT(*)
FROM apartments a LEFT JOIN contractors c ON a.contractorId = c.id
WHERE c.id IS NULL AND a.contractorId IS NOT NULL
UNION ALL
SELECT 'orphan_rentals', COUNT(*)
FROM rentals r LEFT JOIN apartments a ON r.apartmentId = a.id
WHERE a.id IS NULL AND r.apartmentId IS NOT NULL
UNION ALL
SELECT 'orphan_sales', COUNT(*)
FROM sales s LEFT JOIN apartments a ON s.apartmentId = a.id
WHERE a.id IS NULL AND s.apartmentId IS NOT NULL
UNION ALL
SELECT 'orphan_maintenance', COUNT(*)
FROM maintenance m LEFT JOIN apartments a ON m.apartmentId = a.id
WHERE a.id IS NULL AND m.apartmentId IS NOT NULL
UNION ALL
SELECT 'orphan_predictions', COUNT(*)
FROM predictions p LEFT JOIN apartments a ON p.apartmentId = a.id
WHERE a.id IS NULL AND p.apartmentId IS NOT NULL
UNION ALL
SELECT 'orphan_notifications', COUNT(*)
FROM notifications n LEFT JOIN contractors c ON n.contractorId = c.id
WHERE c.id IS NULL AND n.contractorId IS NOT NULL;
