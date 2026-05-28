import { expect, test } from "@playwright/test";

test("creates a mockup run from metadata and preserves portrait outputs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("mockups");
  await expect(page.getByRole("complementary").getByRole("button", { name: "GPT-Image-2", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: "Smart Mix", exact: true })).toBeVisible();
  await expect(page.getByText("Use SynthID cleanup path")).toBeVisible();

  await page.getByLabel("Prompt").fill("A vertical museum website for a contemporary gallery in Virginia.");
  await page.getByRole("button", { name: "Generate mockups" }).click();

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

  await page.locator("summary").click();
  await page.getByRole("button", { name: "Slide deck" }).click();
  await page.getByLabel("Prompt").fill("Create a short design update deck from screenshots and notes.");
  await page.getByRole("button", { name: "Generate decks" }).click();

  await expect(page.getByRole("heading", { name: "Mock deck plan" }).first()).toBeVisible();
  await expect(page.getByText("Slide 1").first()).toBeVisible();
});
