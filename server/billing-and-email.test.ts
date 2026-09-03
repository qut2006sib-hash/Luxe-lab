import { describe, expect, it } from "vitest";
import { escapeHtml, getInternalNotificationEmail } from "./_core/email";
import {
  dateInTimeZone,
  getBillingPeriod,
  getDueDate,
} from "./modules/billing/dates";

describe("billing dates", () => {
  it("caps due days at month end", () => {
    expect(getDueDate(2028, 1, 31).toISOString().slice(0, 10)).toBe(
      "2028-02-29"
    );
    expect(getDueDate(2027, 1, 31).toISOString().slice(0, 10)).toBe(
      "2027-02-28"
    );
  });

  it("creates stable UTC billing periods", () => {
    expect(getBillingPeriod(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07");
  });

  it("resolves the organization-local billing date", () => {
    const instant = new Date("2026-07-31T22:30:00Z");
    expect(dateInTimeZone(instant, "Asia/Damascus").toISOString()).toBe(
      "2026-08-01T12:00:00.000Z"
    );
    expect(dateInTimeZone(instant, "America/New_York").toISOString()).toBe(
      "2026-07-31T12:00:00.000Z"
    );
  });
});

describe("notification email safety", () => {
  it("escapes untrusted values in HTML", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).not.toContain("<img");
    const email = getInternalNotificationEmail({
      organizationName: "<b>Org</b>",
      title: "Invoice <script>",
      message: "Tenant & owner",
    });
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("Tenant & owner");
  });
});
