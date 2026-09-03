import { expect, test, type Page } from "@playwright/test";

async function waitForMutation(page: Page, path: string) {
  return page.waitForResponse(
    response =>
      response.url().includes(path) && response.request().method() === "POST"
  );
}

test("owner creates a patient, test, and billed lab order", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LUXE Lab" })).toBeVisible();

  const accountingSetup = page.getByTestId("accounting-setup");
  if (await accountingSetup.isVisible()) {
    const setupFinished = waitForMutation(page, "accounting.setup");
    await accountingSetup.click();
    await setupFinished;
  }

  await page.goto("/patients");
  await page.getByTestId("patient-name").fill("مريض الاختبار");
  await page.getByTestId("patient-phone").fill("+963944000000");
  const patientSaved = waitForMutation(page, "lab.patients.create");
  await page.getByTestId("patient-save").click();
  await patientSaved;
  await expect(page.getByText("مريض الاختبار")).toBeVisible();

  await page.goto("/catalog");
  await page.getByTestId("test-code").fill("CBC");
  await page.getByTestId("test-price").fill("25000");
  await page.getByTestId("test-name").fill("تعداد دم كامل");
  await page.getByTestId("parameter-code").fill("WBC");
  await page.getByTestId("parameter-name").fill("الكريات البيضاء");
  const testSaved = waitForMutation(page, "lab.tests.create");
  await page.getByTestId("test-save").click();
  await testSaved;
  await expect(page.getByText("تعداد دم كامل")).toBeVisible();

  await page.goto("/");
  await page.getByText("اختر المريض").click();
  await page.getByRole("option", { name: /مريض الاختبار/ }).click();
  await page.getByTestId(/test-option-/).click();
  const orderCreated = waitForMutation(page, "lab.orders.create");
  await page.getByTestId("order-create").click();
  await orderCreated;
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  await expect(page.getByText("مريض الاختبار")).toBeVisible();
  await expect(page.getByText("تعداد دم كامل")).toBeVisible();
});
