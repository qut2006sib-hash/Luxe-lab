-- Disposable legacy fixture intentionally containing integrity violations.
INSERT INTO users (id, openId, name, email)
VALUES
  (1, 'red-user-1', 'Red One', 'red1@example.test'),
  (2, 'red-user-2', 'Red Two', 'red2@example.test');

INSERT INTO contractors (id, userId, companyName, phone)
VALUES
  (1, 1, 'Duplicate Company A', '0500000001'),
  (2, 1, 'Duplicate Company B', '0500000002'),
  (3, 999, 'Orphan Company', '0500000003');

INSERT INTO apartments (id, contractorId, address, apartmentNumber, type)
VALUES
  (1, 1, 'Red Building', 'R-1', 'rent'),
  (2, 2, 'Red Building', 'S-1', 'sale'),
  (3, 999, 'Orphan Building', 'O-1', 'rent');

INSERT INTO rentals (id, apartmentId, tenantName, tenantPhone, monthlyRent, startDate)
VALUES
  (1, 1, 'Tenant A', '0500000101', 1000.00, '2026-01-01'),
  (2, 1, 'Tenant B', '0500000102', 1100.00, '2026-02-01'),
  (3, 999, 'Orphan Tenant', '0500000103', 1200.00, '2026-03-01');

INSERT INTO sales (id, apartmentId, salePrice)
VALUES
  (1, 2, 200000.00),
  (2, 2, 210000.00),
  (3, 999, 220000.00);

INSERT INTO maintenance (id, apartmentId, description)
VALUES (1, 999, 'Orphan maintenance');

INSERT INTO predictions (id, apartmentId, predictionType, predictedValue, confidence)
VALUES (1, 999, 'rent_price', 1500.00, 80.00);

INSERT INTO notifications (id, contractorId, type, title, message)
VALUES (1, 999, 'late_payment', 'Orphan notification', 'Fixture only');
