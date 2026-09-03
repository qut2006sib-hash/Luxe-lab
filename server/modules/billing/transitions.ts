export type InvoiceStatus = "OPEN" | "OVERDUE" | "PAID" | "VOID";
export type InvoiceAction = "MARK_PAID" | "REOPEN" | "VOID";

export function resolveInvoiceTransition(
  current: InvoiceStatus,
  action: InvoiceAction,
  overdueWhenReopened: boolean
): InvoiceStatus {
  if (action === "MARK_PAID") {
    if (current !== "OPEN" && current !== "OVERDUE")
      throw new Error("INVOICE_INVALID_TRANSITION");
    return "PAID";
  }
  if (action === "VOID") {
    if (current === "VOID") throw new Error("INVOICE_INVALID_TRANSITION");
    return "VOID";
  }
  if (current !== "PAID" && current !== "VOID")
    throw new Error("INVOICE_INVALID_TRANSITION");
  return overdueWhenReopened ? "OVERDUE" : "OPEN";
}
