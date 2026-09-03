SELECT COUNT(*) AS blocking_apartments_without_contractor
FROM apartments a LEFT JOIN contractors c ON c.id = a.contractorId
WHERE c.id IS NULL;

SELECT COUNT(*) AS blocking_rentals_without_apartment
FROM rentals r LEFT JOIN apartments a ON a.id = r.apartmentId
WHERE a.id IS NULL;

SELECT COUNT(*) AS blocking_maintenance_without_apartment
FROM maintenance m LEFT JOIN apartments a ON a.id = m.apartmentId
WHERE a.id IS NULL;

SELECT COUNT(*) AS blocking_sales_without_apartment
FROM sales s LEFT JOIN apartments a ON a.id = s.apartmentId
WHERE a.id IS NULL;

SELECT COUNT(*) AS blocking_predictions_without_apartment
FROM predictions p LEFT JOIN apartments a ON a.id = p.apartmentId
WHERE a.id IS NULL;

SELECT COUNT(*) AS blocking_notifications_without_contractor
FROM notifications n LEFT JOIN contractors c ON c.id = n.contractorId
WHERE c.id IS NULL;

SELECT COUNT(*) AS blocking_invalid_rental_dates
FROM rentals
WHERE endDate IS NOT NULL AND endDate < startDate;

SELECT COUNT(*) AS blocking_invalid_coordinates
FROM apartments
WHERE (latitude IS NOT NULL AND (latitude < -90 OR latitude > 90))
   OR (longitude IS NOT NULL AND (longitude < -180 OR longitude > 180));

SELECT
  (SELECT COUNT(*) FROM rentals WHERE monthlyRent < 0)
  + (SELECT COUNT(*) FROM sales WHERE salePrice < 0)
  + (SELECT COUNT(*) FROM maintenance WHERE cost < 0)
  AS blocking_invalid_monetary_values;
