export type LeaseStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type LeaseStatusAction = Exclude<LeaseStatus, "DRAFT">;

const allowedTransitions: Record<LeaseStatus, readonly LeaseStatusAction[]> = {
  DRAFT: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ENDED", "CANCELLED"],
  ENDED: [],
  CANCELLED: [],
};

export function resolveLeaseTransition(
  fromStatus: LeaseStatus,
  toStatus: LeaseStatusAction
) {
  if (!allowedTransitions[fromStatus].includes(toStatus)) {
    throw new Error("LEASE_INVALID_TRANSITION");
  }

  return toStatus;
}
