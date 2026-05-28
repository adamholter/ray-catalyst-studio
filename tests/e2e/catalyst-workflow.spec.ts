import { expect, test } from "@playwright/test";

test("creates a mockup run from metadata and preserves portrait outputs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("mockups");
  await expect(page.getByRole("complementary").getByRole("button", { name: "GPT-Image-2", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: "Smart Mix", exact: true })).toBeVisible();
  await expect(page.getByText("SynthID")).toHaveCount(0);

  await page.getByLabel("Prompt").fill("A vertical museum website for a contemporary gallery in Virginia.");
  await page.getByRole("button", { name: "Generate mockups" }).click();

  // Wait for generation to complete
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });

  const card = page.locator(".run-card").first();
  await expect(card).toBeVisible();

  const result = card.locator("img").first();
  await expect(result).toBeVisible();

  const dimensions = await result.evaluate((img) => ({
    naturalWidth: (img as HTMLImageElement).naturalWidth,
    naturalHeight: (img as HTMLImageElement).naturalHeight,
    renderedWidth: img.getBoundingClientRect().width,
    renderedHeight: img.getBoundingClientRect().height
  }));

  expect(dimensions.naturalHeight).toBeGreaterThan(dimensions.naturalWidth);
  expect(dimensions.renderedHeight).toBeGreaterThan(dimensions.renderedWidth);

  await card.getByRole("button", { name: "Output from GPT-Image-2 Actions" }).click();
  await expect(page.locator(".modal-surface")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible();
  await expect(page.getByText("Prompt Brief")).toHaveCount(0);
  await expect(page.getByText("Activity Log")).toHaveCount(0);

  await page.getByRole("button", { name: "Enhance" }).click();
  await expect(page.getByRole("button", { name: "Enhance" })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".modal-close")).toBeVisible();
  await page.locator(".modal-close").click();
  await expect(page.locator(".modal-surface")).not.toBeVisible();
});

test("main mockup surface does not expose unfinished task switches", async ({ page }) => {
  await page.goto("/");

  await page.locator("summary").click();
  await expect(page.getByRole("button", { name: "Slide deck" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Logo / mark" })).toHaveCount(0);
  await expect(page.getByText("registry")).toHaveCount(0);
});
