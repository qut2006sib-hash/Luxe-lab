import { expect, test, type Page } from "@playwright/test";

async function waitForMutation(page: Page, path: string) {
  return page.waitForResponse(
    response =>
      response.url().includes(path) && response.request().method() === "POST"
  );
}

test("owner creates, results, approves, and collects a lab order", async ({
  page,
}) => {
  const suffix = Date.now();
  const patientName = `مريض الاختبار ${suffix}`;
  const testName = `تعداد دم كامل ${suffix}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LUXE Lab" })).toBeVisible();
  await expect(page.getByTestId("order-create")).toBeVisible();

  const accountingSetup = page.getByTestId("accounting-setup");
  if (await accountingSetup.isVisible()) {
    const setupFinished = waitForMutation(page, "accounting.setup");
    await accountingSetup.click();
    await setupFinished;
    await expect(accountingSetup).toHaveCount(0);
  }

  await page.goto("/patients");
  await page.getByTestId("patient-name").fill(patientName);
  await page.getByTestId("patient-phone").fill("+963944000000");
  const patientSaved = waitForMutation(page, "lab.patients.create");
  await page.getByTestId("patient-save").click();
  await patientSaved;
  await expect(page.getByText(patientName, { exact: true })).toBeVisible();

  await page.goto("/catalog");
  await page.getByTestId("test-code").fill(`CBC-${suffix}`);
  await page.getByTestId("test-price").fill("25000");
  await page.getByTestId("test-name").fill(testName);
  await page.getByTestId("parameter-code").fill("WBC");
  await page.getByTestId("parameter-name").fill("الكريات البيضاء");
  const testSaved = waitForMutation(page, "lab.tests.create");
  await page.getByTestId("test-save").click();
  await testSaved;
  await expect(
    page.getByRole("heading", { name: testName, exact: true })
  ).toBeVisible();

  await page.goto("/");
  await page.getByText("اختر المريض").click();
  await page.getByRole("option").filter({ hasText: patientName }).click();
  await page
    .getByTestId(/test-option-/)
    .filter({ hasText: testName })
    .click();
  const orderCreated = waitForMutation(page, "lab.orders.create");
  await page.getByTestId("order-create").click();
  await orderCreated;
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  await expect(page.getByText(patientName, { exact: true })).toBeVisible();
  await expect(page.getByText(testName, { exact: true })).toBeVisible();

  const resultInput = page.getByLabel("الكريات البيضاء", { exact: true });
  await resultInput.fill("7.2");
  await page.getByRole("button", { name: "حفظ النتائج", exact: true }).click();
  await expect(page.getByText("جاهز للاعتماد", { exact: true })).toBeVisible();
  await page.reload();
  await expect(resultInput).toHaveValue("7.2");
  await page
    .getByRole("button", { name: "اعتماد النتائج", exact: true })
    .click();
  await expect(page.getByTestId("order-status")).toHaveText("معتمد");
  await expect(resultInput).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "حفظ النتائج", exact: true })
  ).toHaveCount(0);

  const paymentInput = page.getByLabel("دفعة نقدية", { exact: true });
  await paymentInput.fill("10000");
  await page.getByRole("button", { name: "تسجيل الدفعة", exact: true }).click();
  await expect(paymentInput).toHaveValue("15000.00");
  await page.reload();
  await expect(paymentInput).toHaveValue("15000.00");
  await page.getByRole("button", { name: "تسجيل الدفعة", exact: true }).click();
  await expect(paymentInput).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("order-status")).toHaveText("معتمد");
  await expect(resultInput).toHaveValue("7.2");
  await expect(resultInput).toBeDisabled();
  await expect(paymentInput).toHaveCount(0);
});
