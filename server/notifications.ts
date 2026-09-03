import { getNotifications as readNotifications } from "./db";

/**
 * Read-only compatibility wrapper. Notification creation is handled by the
 * transactional outbox and worker; the web process never performs delivery.
 */
export async function getNotifications(contractorId: number) {
  return await readNotifications(contractorId);
}
