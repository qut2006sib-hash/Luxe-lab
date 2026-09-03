-- P3-B post-migration validation for migration 0004.
-- Run only after the preflight summary is green and migration 0004 succeeds.

SELECT COUNT(*) AS user_settings_table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'user_settings';

-- Expected value: 10.
SELECT COUNT(*) AS user_settings_column_count
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'user_settings';

SELECT
  ordinal_position,
  column_name,
  column_type,
  is_nullable,
  column_default,
  extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'user_settings'
ORDER BY ordinal_position;

-- Every row below must report present_count = 1.
SELECT expected.constraint_name, COUNT(tc.constraint_name) AS present_count
FROM (
  SELECT 'contractors_userId_unique' AS constraint_name
  UNION ALL SELECT 'rentals_apartmentId_unique'
  UNION ALL SELECT 'sales_apartmentId_unique'
  UNION ALL SELECT 'user_settings_userId_unique'
  UNION ALL SELECT 'user_settings_userId_users_id_fk'
  UNION ALL SELECT 'contractors_userId_users_id_fk'
  UNION ALL SELECT 'apartments_contractorId_contractors_id_fk'
  UNION ALL SELECT 'rentals_apartmentId_apartments_id_fk'
  UNION ALL SELECT 'sales_apartmentId_apartments_id_fk'
  UNION ALL SELECT 'maintenance_apartmentId_apartments_id_fk'
  UNION ALL SELECT 'predictions_apartmentId_apartments_id_fk'
  UNION ALL SELECT 'notifications_contractorId_contractors_id_fk'
) expected
LEFT JOIN information_schema.table_constraints tc
  ON tc.constraint_schema = DATABASE()
 AND tc.constraint_name = expected.constraint_name
GROUP BY expected.constraint_name
ORDER BY expected.constraint_name;

-- All issue_count values must remain zero.
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

-- Record these before and after migration and require exact equality.
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'contractors', COUNT(*) FROM contractors
UNION ALL SELECT 'apartments', COUNT(*) FROM apartments
UNION ALL SELECT 'rentals', COUNT(*) FROM rentals
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'maintenance', COUNT(*) FROM maintenance
UNION ALL SELECT 'predictions', COUNT(*) FROM predictions
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications;
