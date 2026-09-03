import { describe, expect, it } from "vitest";
import {
  assertOrderCanApprove,
  assertOrderCanReceiveResults,
  assertUniqueTestIds,
  normalizeParameterDefinition,
  normalizeResultValue,
  resolveResultProgress,
} from "./domain";

describe("lab domain rules", () => {
  it("rejects missing or duplicate tests", () => {
    expect(() => assertUniqueTestIds([])).toThrow("LAB_ORDER_TESTS_REQUIRED");
    expect(() => assertUniqueTestIds([1, 1])).toThrow(
      "LAB_ORDER_TESTS_DUPLICATED"
    );
    expect(() => assertUniqueTestIds([1, 2])).not.toThrow();
  });

  it("requires distinct choices for choice parameters", () => {
    expect(() =>
      normalizeParameterDefinition({
        resultType: "CHOICE",
        choices: ["Positive"],
      })
    ).toThrow("LAB_PARAMETER_CHOICES_REQUIRED");
    expect(
      normalizeParameterDefinition({
        resultType: "CHOICE",
        choices: [" Positive ", "Negative"],
      })
    ).toEqual(["Positive", "Negative"]);
  });

  it("rejects choices on non-choice parameters", () => {
    expect(() =>
      normalizeParameterDefinition({
        resultType: "TEXT",
        choices: ["Unexpected"],
      })
    ).toThrow("LAB_PARAMETER_CHOICES_INVALID");
  });

  it("normalizes numeric and choice results", () => {
    expect(
      normalizeResultValue({ resultType: "NUMBER", value: " 12.50 " })
    ).toBe("12.50");
    expect(() =>
      normalizeResultValue({ resultType: "NUMBER", value: "twelve" })
    ).toThrow("LAB_RESULT_NUMBER_INVALID");
    expect(
      normalizeResultValue({
        resultType: "CHOICE",
        value: "Positive",
        choices: ["Positive", "Negative"],
      })
    ).toBe("Positive");
  });

  it("tracks partial and complete result entry", () => {
    expect(resolveResultProgress([null, null])).toBe("ORDERED");
    expect(resolveResultProgress(["10", null])).toBe("IN_PROGRESS");
    expect(resolveResultProgress(["10", "Normal"])).toBe("COMPLETED");
  });

  it("prevents result edits outside active workflow", () => {
    expect(() => assertOrderCanReceiveResults("ORDERED")).not.toThrow();
    expect(() => assertOrderCanReceiveResults("IN_PROGRESS")).not.toThrow();
    expect(() => assertOrderCanReceiveResults("APPROVED")).toThrow(
      "LAB_ORDER_RESULTS_STATUS_INVALID"
    );
  });

  it("approves only complete orders", () => {
    expect(() =>
      assertOrderCanApprove("COMPLETED", ["12.5", "Negative"])
    ).not.toThrow();
    expect(() => assertOrderCanApprove("IN_PROGRESS", ["12.5", null])).toThrow(
      "LAB_ORDER_APPROVAL_STATUS_INVALID"
    );
    expect(() => assertOrderCanApprove("COMPLETED", ["12.5", null])).toThrow(
      "LAB_ORDER_RESULTS_INCOMPLETE"
    );
  });
});
