import { describe, expect, it } from "vitest";
import { formatPrice } from "../client/src/lib/currency";

describe("organization currency formatting", () => {
  it.each(["USD", "SAR", "AED", "SYP"] as const)(
    "formats %s through Intl.NumberFormat",
    currency => {
      const formatted = formatPrice(1234.5, currency, "en");
      expect(formatted).toContain("1,234.50");
      expect(formatted).toMatch(
        currency === "USD" ? /\$/ : new RegExp(currency)
      );
    }
  );

  it("uses the selected user language", () => {
    expect(formatPrice(42, "USD", "ar")).not.toBe(formatPrice(42, "USD", "en"));
  });
});
