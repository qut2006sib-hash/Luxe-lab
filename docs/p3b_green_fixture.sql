-- Disposable legacy fixture with valid relationships and no duplicates.
INSERT INTO users (id, openId, name, email)
VALUES
  (1, 'green-user-1', 'Green One', 'green1@example.test'),
  (2, 'green-user-2', 'Green Two', 'green2@example.test');

INSERT INTO contractors (id, userId, companyName, phone)
VALUES
  (1, 1, 'Green Rentals', '0500000001'),
  (2, 2, 'Green Sales', '0500000002');

INSERT INTO apartments (id, contractorId, address, apartmentNumber, type, status)
VALUES
  (1, 1, 'Green Building', 'R-1', 'rent', 'rented'),
  (2, 2, 'Green Building', 'S-1', 'sale', 'sold');

INSERT INTO rentals (
  id, apartmentId, tenantName, tenantPhone, monthlyRent, startDate
)
VALUES (1, 1, 'Green Tenant', '0500000101', 1000.00, '2026-01-01');

INSERT INTO sales (id, apartmentId, salePrice, isSold, buyerName)
VALUES (1, 2, 200000.00, true, 'Green Buyer');

INSERT INTO maintenance (id, apartmentId, description)
VALUES (1, 1, 'Valid maintenance');

INSERT INTO predictions (
  id, apartmentId, predictionType, predictedValue, confidence
)
VALUES (1, 2, 'sale_price', 210000.00, 85.00);

INSERT INTO notifications (id, contractorId, type, title, message)
VALUES (1, 1, 'late_payment', 'Valid notification', 'Fixture only');
