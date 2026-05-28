import { expect, test } from "@playwright/test";

test("creates a mockup run from metadata and preserves portrait outputs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Catalyst Studio")).toBeVisible();
  await expect(page.getByText("Mock-safe by default")).toBeVisible();
  await expect(page.getByText("SynthID", { exact: true })).toBeVisible();

  await page.getByLabel("Prompt").fill("A vertical museum website for a contemporary gallery in Virginia.");
  await page.getByRole("button", { name: "Create run" }).click();

  const result = page.locator(".run-card img").first();
  await expect(result).toBeVisible();

  const dimensions = await result.evaluate((img) => ({
    naturalWidth: (img as HTMLImageElement).naturalWidth,
    naturalHeight: (img as HTMLImageElement).naturalHeight,
    renderedWidth: img.getBoundingClientRect().width,
    renderedHeight: img.getBoundingClientRect().height
  }));

  expect(dimensions.naturalHeight).toBeGreaterThan(dimensions.naturalWidth);
  expect(dimensions.renderedHeight).toBeGreaterThan(dimensions.renderedWidth);
});

test("deck task is available as an extensible future workflow", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Slide deck" }).click();
  await page.getByLabel("Prompt").fill("Create a short design update deck from screenshots and notes.");
  await page.getByRole("button", { name: "Create run" }).click();

  await expect(page.getByText("Mock deck plan")).toBeVisible();
  await expect(page.getByText("Slide 1")).toBeVisible();
});
