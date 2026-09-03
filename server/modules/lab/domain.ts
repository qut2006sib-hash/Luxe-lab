export type LabOrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "APPROVED"
  | "CANCELLED";

export type LabResultType = "NUMBER" | "TEXT" | "CHOICE";

export function assertUniqueTestIds(testIds: readonly number[]): void {
  if (testIds.length === 0) throw new Error("LAB_ORDER_TESTS_REQUIRED");
  if (new Set(testIds).size !== testIds.length)
    throw new Error("LAB_ORDER_TESTS_DUPLICATED");
}

export function normalizeParameterDefinition(input: {
  resultType: LabResultType;
  choices?: readonly string[];
}) {
  const choices = (input.choices ?? [])
    .map(choice => choice.trim())
    .filter(Boolean);
  if (input.resultType === "CHOICE") {
    if (choices.length < 2) throw new Error("LAB_PARAMETER_CHOICES_REQUIRED");
    if (new Set(choices).size !== choices.length)
      throw new Error("LAB_PARAMETER_CHOICES_DUPLICATED");
    return choices;
  }
  if (choices.length > 0) throw new Error("LAB_PARAMETER_CHOICES_INVALID");
  return undefined;
}

export function normalizeResultValue(input: {
  resultType: LabResultType;
  value: string;
  choices?: readonly string[] | null;
}) {
  const value = input.value.trim();
  if (!value) throw new Error("LAB_RESULT_VALUE_REQUIRED");
  if (input.resultType === "NUMBER") {
    if (!/^-?\d+(\.\d+)?$/.test(value))
      throw new Error("LAB_RESULT_NUMBER_INVALID");
  }
  if (input.resultType === "CHOICE" && !(input.choices ?? []).includes(value)) {
    throw new Error("LAB_RESULT_CHOICE_INVALID");
  }
  return value;
}

export function assertOrderCanReceiveResults(status: LabOrderStatus): void {
  if (status !== "ORDERED" && status !== "IN_PROGRESS") {
    throw new Error("LAB_ORDER_RESULTS_STATUS_INVALID");
  }
}

export function resolveResultProgress(values: readonly (string | null)[]) {
  if (values.length === 0) throw new Error("LAB_ORDER_RESULTS_REQUIRED");
  const recorded = values.filter(value => Boolean(value?.trim())).length;
  if (recorded === 0) return "ORDERED" as const;
  return recorded === values.length
    ? ("COMPLETED" as const)
    : ("IN_PROGRESS" as const);
}

export function assertOrderCanApprove(
  status: LabOrderStatus,
  values: readonly (string | null)[]
): void {
  if (status !== "COMPLETED")
    throw new Error("LAB_ORDER_APPROVAL_STATUS_INVALID");
  if (values.length === 0 || values.some(value => !value?.trim())) {
    throw new Error("LAB_ORDER_RESULTS_INCOMPLETE");
  }
}
