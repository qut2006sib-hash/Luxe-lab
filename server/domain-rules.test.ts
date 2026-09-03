import { describe, expect, it } from "vitest";
import { hasPermission } from "./modules/organizations/permissions";

describe("organization role matrix", () => {
  it("allows accountants to write and post accounting transactions", () => {
    expect(hasPermission("accountant", "accounting.write")).toBe(true);
    expect(hasPermission("accountant", "accounting.post")).toBe(true);
    expect(hasPermission("manager", "accounting.post")).toBe(false);
    expect(hasPermission("viewer", "finance.read")).toBe(false);
  });

  it("keeps clinical workflows with owners and lab managers", () => {
    expect(hasPermission("owner", "lab.write")).toBe(true);
    expect(hasPermission("manager", "lab.write")).toBe(true);
    expect(hasPermission("manager", "lab.results.approve")).toBe(true);
    expect(hasPermission("accountant", "lab.write")).toBe(false);
    expect(hasPermission("viewer", "lab.results.approve")).toBe(false);
  });
});
