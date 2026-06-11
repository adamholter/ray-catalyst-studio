import { expect, test } from "@playwright/test";

test("creates a mockup run from metadata and preserves portrait outputs", async ({ page }) => {
  await page.goto("/mockup");

  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("mockups");
  await expect(page.getByLabel("Generation model")).toBeVisible();
  await expect(page.getByLabel("Generation model")).toContainText("GPT-Image-2");
  await expect(page.getByLabel("Generation model")).toContainText("Grok Imagine Quality");
  await expect(page.getByLabel("Generation model")).toContainText("Recraft V4.1");
  await expect(page.getByLabel("Generation model")).not.toContainText("Smart Mix");
  await expect(page.getByText("SynthID")).toHaveCount(0);

  await page.getByLabel("Prompt").fill("A vertical museum website for a contemporary gallery in Virginia.");
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.getByRole("button", { name: "Generate mockups" }).click();
  await expect(page.getByText("Sending prompt to GPT-Image-2...")).toBeVisible();
  await expect(page.locator(".run-card.running").getByText("Generating mockup...").first()).toBeVisible();

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
  await page.goto("/mockup");

  await page.locator("summary").click();
  await expect(page.getByRole("button", { name: "Slide deck" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Logo / mark" })).toHaveCount(0);
  await expect(page.getByText("registry")).toHaveCount(0);
});

test("renders rich mockup brief fields on the mockup workspace", async ({ page }) => {
  await page.goto("/mockup");

  await expect(page.getByLabel("Client / Website Type")).toBeVisible();
  await expect(page.getByLabel("Client Preferences")).toBeVisible();
  await expect(page.getByLabel("Logo Description")).toBeVisible();
  await expect(page.getByLabel("Brand Archetype")).toBeVisible();
  await expect(page.getByLabel("Variation Amount")).toBeVisible();
  await expect(page.getByLabel("Brand Archetype")).toHaveValue("Everyday");
  await expect(page.getByLabel("Variation Amount")).toHaveValue("standard");
});

test("aspect ratio slider adapts to the selected model contract", async ({ page }) => {
  await page.goto("/mockup");

  const aspectSection = page.locator(".sidebar-section", { hasText: "Aspect ratio" });
  await expect(aspectSection).toBeVisible();
  await expect(aspectSection.locator(".sidebar-value")).toHaveText("2:3");

  await page.getByLabel("Generation model").selectOption("seedream-5-lite");
  await expect(aspectSection.locator(".sidebar-value")).toHaveText("3:4");
  await expect(aspectSection).toContainText("16:9");
  await expect(aspectSection).toContainText("9:16");
  await expect(aspectSection).not.toContainText("2:3");

  await page.getByLabel("Step wider").click();
  await expect(aspectSection.locator(".sidebar-value")).toHaveText("1:1");

  await page.getByLabel("Generation model").selectOption("nano-banana-2");
  await expect(aspectSection).toContainText("8:1");
  await expect(aspectSection).toContainText("1:8");
});

test("mockup catalyst submits rich brief inputs for prompt enhancement", async ({ page }) => {
  let requestPayload: any = null;

  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      requestPayload = route.request().postDataJSON();
    }
    await route.continue();
  });

  await page.goto("/mockup");

  await page.getByLabel("Prompt").fill("A playful preschool homepage.");
  await page.getByLabel("Enhance input (LLM rewriting)").check();
  await page.getByLabel("Client / Website Type").fill("Quality learning center");
  await page.getByLabel("Client Preferences").fill("Warm, safe, colorful, parent-friendly.");
  await page.getByLabel("Logo Description").fill("Rainbow logo with chunky lowercase lettering.");
  await page.getByLabel("Brand Archetype").selectOption("Caregiver");
  await page.getByLabel("Variation Amount").selectOption("high");
  await page.locator("#colorPalette").fill("#7B61FF, #FF6F91, #FFD23F");
  await page.getByRole("button", { name: "Generate mockups" }).click();

  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });
  expect(requestPayload).not.toBeNull();
  expect(requestPayload.inputs.enhancePrompt).toBe(true);
  expect(requestPayload.inputs.clientType).toBe("Quality learning center");
  expect(requestPayload.inputs.clientPreferences).toBe("Warm, safe, colorful, parent-friendly.");
  expect(requestPayload.inputs.logoDescription).toBe("Rainbow logo with chunky lowercase lettering.");
  expect(requestPayload.inputs.brandArchetype).toBe("Caregiver");
  expect(requestPayload.inputs.variationAmount).toBe("high");
  expect(requestPayload.inputs.colorPalette).toEqual(["#7B61FF", "#FF6F91", "#FFD23F"]);
});

test("converts a raster mockup to editable HTML with mapped assets", async ({ page }) => {
  const generatedRun: any = {
    id: "mockup-convert-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "succeeded",
    request: {
      taskId: "mockup",
      modelId: "gpt-image-2",
      inputs: { prompt: "A contemporary art museum landing page.", aspectRatio: "2:3" },
      attachments: []
    },
    model: { id: "gpt-image-2", label: "GPT-Image-2", provider: "fal", endpoint: "openai/gpt-image-2" },
    output: {
      images: [{ url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='864' height='1296'></svg>", width: 864, height: 1296 }]
    },
    events: []
  };
  const convertedRun = {
    ...generatedRun,
    output: {
      ...generatedRun.output,
      mockup: {
        id: "mockup-editable-1",
        sourceImageUrl: generatedRun.output.images[0].url,
        sourceWidth: 864,
        sourceHeight: 1296,
        html: "<main contenteditable=\"true\"><h1>Header image asset</h1><section>Editable museum landing page</section></main>",
        css: "body{margin:0;font-family:serif;background:#fff;color:#111} main{padding:48px}",
        assets: Array.from({ length: 5 }, (_, index) => ({
          id: `asset-${index + 1}`,
          name: index === 0 ? "Header image asset" : `Exhibition image ${index}`,
          url: generatedRun.output.images[0].url,
          type: "image",
          dimensions: "320x240",
          status: "source-crop"
        })),
        generatedAt: new Date().toISOString(),
        comparison: { status: "ready-for-review", notes: [] }
      }
    }
  };

  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: [] })
      });
      return;
    }
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ run: generatedRun })
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/runs/mockup-convert-1/convert", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ run: convertedRun })
    });
  });

  await page.goto("/mockup");

  await page.getByLabel("Prompt").fill("A contemporary art museum landing page.");
  await page.getByRole("button", { name: "Generate mockups" }).click();

  // Wait for generation to complete
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });

  const card = page.locator(".run-card").first();
  await card.getByRole("button", { name: "Output from GPT-Image-2 Actions" }).click();
  await expect(page.locator(".modal-surface")).toBeVisible();

  const convertBtn = page.getByRole("button", { name: "✦ Convert to HTML" });
  await expect(convertBtn).toBeVisible();
  await convertBtn.click();

  // Expect Mockup Editor overlay to open
  await expect(page.locator(".mockup-editor-fullscreen")).toBeVisible({ timeout: 25000 });

  // Verify interaction tools and iframe preview
  await expect(page.getByRole("button", { name: "Select Block" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Direct Text" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect Assets" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compare View" })).toBeVisible();
  await expect(page.locator("#mockup-preview-frame")).toBeVisible();
  await expect(page.locator(".asset-item-tile")).toHaveCount(5);
  await expect(page.getByText("Header image asset")).toBeVisible();

  // Check code view
  await page.getByRole("button", { name: "HTML Source" }).click();
  await expect(page.locator(".code-textarea")).toBeVisible();
  await expect(page.locator(".code-textarea")).toHaveValue(/contenteditable/);

  // Exit editor
  await page.getByRole("button", { name: "Exit mockup editor" }).click();
  await expect(page.locator(".mockup-editor-fullscreen")).not.toBeVisible();
});

test("editable mockup page converts an uploaded raster image into the canvas editor", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAMCAIAAADQ/GvKAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVR4nGO4s6UCK2IYlahACxIAb1rDAWwwrCUAAAAASUVORK5CYII=",
    "base64"
  );

  await page.goto("/editable");
  await expect(page.getByText("Convert a raster mockup into editable HTML.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "uploaded-mockup.png",
    mimeType: "image/png",
    buffer: png
  });
  await expect(page.getByText("uploaded-mockup.png")).toBeVisible();
  await page.getByLabel("Conversion notes").fill("Simple uploaded test mockup with editable text areas.");
  await page.getByRole("button", { name: "Make editable" }).click();
  await expect(page.locator(".mockup-editor-fullscreen")).toBeVisible({ timeout: 25000 });
  await expect(page.getByRole("button", { name: "Design Canvas" })).toHaveClass(/active/);
  await expect(page.locator(".grapes-editor-shell")).toBeVisible();
  await expect(page.getByText("clean extraction: text + overlays").first()).toBeVisible();
  await expect(page.locator(".asset-tile-media img").first()).toBeVisible();
  const firstAssetDimensions = await page.locator(".asset-tile-media img").first().evaluate((image) => ({
    width: (image as HTMLImageElement).naturalWidth,
    height: (image as HTMLImageElement).naturalHeight,
    src: (image as HTMLImageElement).src
  }));
  expect(firstAssetDimensions.src).toMatch(/^data:image\//);
  expect(firstAssetDimensions.src).toContain("asset%20extraction%20pending");
  expect(firstAssetDimensions.width).toBeGreaterThan(100);
  expect(firstAssetDimensions.height).toBeGreaterThan(100);
  await expect(page.locator(".asset-tile-crop")).toHaveCount(0);
  const designFrameElement = page.locator(".gjs-frame").last();
  await expect(designFrameElement).toBeVisible();
  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        if (await frame.locator("[contenteditable]").count().catch(() => 0)) return true;
      }
      return false;
    })
    .toBe(true);
  let editableFrame = page.frames()[0];
  for (const frame of page.frames()) {
    if (await frame.locator("[contenteditable]").count().catch(() => 0)) {
      editableFrame = frame;
      break;
    }
  }
  const heroSection = editableFrame.locator(".hero").first();
  await heroSection.click();
  await expect(page.getByText("Visual Element Controls")).toBeVisible();
  const heroBox = await heroSection.boundingBox();
  expect(heroBox).not.toBeNull();
  await page.mouse.move(heroBox!.x + 24, heroBox!.y + 24);
  await page.mouse.down();
  await page.mouse.move(heroBox!.x + 48, heroBox!.y + 40);
  await page.mouse.up();
  await editableFrame.locator("h1").first().click();
  await page.getByRole("button", { name: "Center", exact: true }).click();
  await editableFrame.locator("[contenteditable]").first().evaluate((element) => {
    element.textContent = "Editable landing page";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "Editable landing page" }));
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export HTML/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/catalyst-mockup.*\.html/);
  await page.getByRole("button", { name: "HTML Source" }).click();
  await expect(page.locator(".code-textarea")).toHaveValue(/contenteditable/);
  await expect(page.locator(".code-textarea")).toHaveValue(/Editable landing page/);
  await expect(page.locator(".code-textarea")).toHaveValue(/text-align:\s*center/);
  await expect(page.locator(".code-textarea")).toHaveValue(/left:\s*24px/);
  await page.getByRole("button", { name: "Exit mockup editor" }).click();
  await expect(page.locator(".mockup-editor-fullscreen")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open editor" })).toBeVisible();
});

test("runs logo catalyst with optional color palette field or prompt only", async ({ page }) => {
  let storedRuns: unknown[] = [];
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: storedRuns })
      });
      return;
    }

    if (route.request().method() === "POST") {
      const request = route.request().postDataJSON();
      const run = {
        id: `logo-run-${storedRuns.length + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "succeeded",
        request,
        model: {
          id: request.modelId,
          label: "Grok Imagine",
          provider: "fal",
          endpoint: "xai/grok-imagine-image",
          synthId: { status: "none", note: "", applyUpscaleByDefault: false },
          defaultPostprocessors: []
        },
        output: { images: [{ url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'></svg>" }] },
        events: []
      };
      storedRuns = [run, ...storedRuns];
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ run })
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/logo");

  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("logos");
  
  // Verify optional Color Palette input is visible
  const paletteInput = page.locator("#colorPalette");
  await expect(paletteInput).toBeVisible();
  await expect(paletteInput).toHaveAttribute("placeholder", "Optional hex colors: #111318, #F7F3EA");
  await expect(paletteInput).toHaveValue("");
  await expect(page.locator(".run-card-title", { hasText: "GPT-Image-2" })).toHaveCount(0);

  // Run with prompt only
  await page.getByLabel("Prompt").fill("Minimalist tech company logo.");
  await page.getByRole("button", { name: "Generate logos" }).click();

  // Wait for generation to complete
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });
  await expect(page.locator(".run-card.succeeded").first()).toBeVisible();

  // Run with color palette provided
  await paletteInput.fill("#355C7D, #C06C84, #111318");
  await page.getByRole("button", { name: "Generate logos" }).click();

  // Wait for second generation to complete
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });
  await expect(page.locator(".run-card.succeeded").first()).toBeVisible();
  await expect(page.locator(".run-card-title", { hasText: "Grok Imagine" }).first()).toBeVisible();
  await expect(page.locator(".run-card-title", { hasText: "GPT-Image-2" })).toHaveCount(0);
});

test("loads logo catalyst via /logo or /logos pathnames", async ({ page }) => {
  // Load via /logo
  await page.goto("/logo");
  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("logos");
  await expect(page.locator("#colorPalette")).toBeVisible();

  // Load via /logos
  await page.goto("/logos");
  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("logos");
  await expect(page.locator("#colorPalette")).toBeVisible();
});

test("logo catalyst gallery only shows logo runs, mockup catalyst gallery only shows mockup runs", async ({ page }) => {
  const mockRuns = [
    {
      id: "run-mockup-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "succeeded",
      request: {
        taskId: "mockup",
        modelId: "gpt-image-2",
        inputs: { prompt: "Mockup 1", aspectRatio: "2:3" },
        attachments: []
      },
      model: { id: "gpt-image-2", label: "GPT-Image-2", provider: "fal", endpoint: "openai/gpt-image-2" },
      output: { images: [{ url: "data:image/svg+xml,<svg></svg>" }] },
      events: []
    },
    {
      id: "run-logo-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "succeeded",
      request: {
        taskId: "logo",
        modelId: "grok-imagine",
        inputs: { prompt: "Logo 1", aspectRatio: "1:1" },
        attachments: []
      },
      model: { id: "grok-imagine", label: "Grok Imagine Logo", provider: "fal", endpoint: "xai/grok-imagine-image" },
      output: { images: [{ url: "data:image/svg+xml,<svg></svg>" }] },
      events: []
    }
  ];

  // Route GET /api/runs to return our mock runs
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: mockRuns })
      });
    } else {
      await route.continue();
    }
  });

  // 1. Visit /mockup (Mockup Catalyst)
  await page.goto("/mockup");
  // Should display 1 run card (the mockup run) and it should be for GPT-Image-2
  await expect(page.locator(".run-card")).toHaveCount(1);
  await expect(page.locator(".run-card-title")).toHaveText("GPT-Image-2");

  // 2. Visit /logo (Logo Catalyst)
  await page.goto("/logo");
  // Should display 1 run card (the logo run) and it should be for Grok Imagine Logo
  await expect(page.locator(".run-card")).toHaveCount(1);
  await expect(page.locator(".run-card-title")).toHaveText("Grok Imagine Logo");
});

test("logo catalyst submits selected model and quality correctly for GPT-Image-2", async ({ page }) => {
  await page.goto("/logo");

  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("logos");

  // Verify starts with Grok Imagine as active in sidebar
  await expect(page.getByLabel("Generation model")).toHaveValue("grok-imagine");
  await expect(page.locator(".topbar-chip")).toHaveText("Grok Imagine");

  // Select GPT-Image-2 in sidebar
  await page.getByLabel("Generation model").selectOption("gpt-image-2");
  await expect(page.getByLabel("Generation model")).toHaveValue("gpt-image-2");
  await expect(page.locator(".topbar-chip")).toHaveText(/GPT-Image-2/);

  // Click High quality
  await page.getByRole("complementary").getByRole("button", { name: "High", exact: true }).click();
  await expect(page.getByRole("complementary").getByRole("button", { name: "High", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".topbar-chip")).toHaveText("GPT-Image-2 · high");

  await page.getByLabel("Prompt").fill("A glowing tech logo");

  let requestPayload: any = null;
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      requestPayload = route.request().postDataJSON();
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Generate logos" }).click();
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });

  expect(requestPayload).not.toBeNull();
  expect(requestPayload.modelId).toBe("gpt-image-2");
  expect(requestPayload.inputs.quality).toBe("high");
});

test("logo catalyst submits selected model and resolution correctly for Grok Imagine Quality", async ({ page }) => {
  await page.goto("/logo");

  await expect(page.getByText("✦ catalyst")).toBeVisible();

  // Select Grok Imagine Quality in sidebar
  await page.getByLabel("Generation model").selectOption("grok-imagine-quality");
  await expect(page.getByLabel("Generation model")).toHaveValue("grok-imagine-quality");

  // Click 2K resolution
  await page.getByRole("complementary").getByRole("button", { name: "2K", exact: true }).click();
  await expect(page.getByRole("complementary").getByRole("button", { name: "2K", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".topbar-chip")).toHaveText("Grok Imagine Quality · 2k");

  await page.getByLabel("Prompt").fill("A futuristic company crest");

  let requestPayload: any = null;
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      requestPayload = route.request().postDataJSON();
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Generate logos" }).click();
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });

  expect(requestPayload).not.toBeNull();
  expect(requestPayload.modelId).toBe("grok-imagine-quality");
  expect(requestPayload.inputs.resolution).toBe("2k");
});

test("logo catalyst submits Seedream 5 Lite without unsupported aspect ratio field", async ({ page }) => {
  await page.goto("/logo");

  await expect(page.locator(".topbar-chip")).toHaveText("Grok Imagine");
  await page.getByLabel("Generation model").selectOption("seedream-5-lite");
  await expect(page.getByLabel("Generation model")).toHaveValue("seedream-5-lite");
  await expect(page.locator(".topbar-chip")).toHaveText("Seedream 5 Lite");
  await page.getByLabel("Prompt").fill("A clean turtle coffee logo");

  let requestPayload: any = null;
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      requestPayload = route.request().postDataJSON();
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Generate logos" }).click();
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });

  expect(requestPayload).not.toBeNull();
  expect(requestPayload.modelId).toBe("seedream-5-lite");
  expect(requestPayload.inputs.aspectRatio).toBe("1:1");
});

test("logo catalyst keeps model controls usable while a generation is running", async ({ page }) => {
  let storedRuns: unknown[] = [];
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: storedRuns })
      });
      return;
    }

    if (route.request().method() === "POST") {
      const request = route.request().postDataJSON();
      const run = {
        id: "running-logo-run",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "running",
        request,
        model: {
          id: request.modelId,
          label: "GPT-Image-2",
          provider: "fal",
          endpoint: "openai/gpt-image-2",
          synthId: { status: "possible", note: "", applyUpscaleByDefault: false },
          defaultPostprocessors: []
        },
        events: []
      };
      storedRuns = [run];
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ run })
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/logo");
  await page.getByLabel("Prompt").fill("Long running logo generation");
  await page.getByLabel("Generation model").selectOption("gpt-image-2");
  await page.getByRole("complementary").getByRole("button", { name: "High", exact: true }).click();
  await page.getByRole("button", { name: "Generate logos" }).click();

  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 5000 });
  await expect(page.getByText("Generating logo...")).toBeVisible();

  await page.getByLabel("Generation model").selectOption("nano-banana-2");
  await expect(page.getByLabel("Generation model")).toHaveValue("nano-banana-2");
  await expect(page.locator(".topbar-chip")).toHaveText("Nano Banana 2");

  await page.getByLabel("Generation model").selectOption("grok-imagine-quality");
  await page.getByRole("complementary").getByRole("button", { name: "2K", exact: true }).click();
  await expect(page.locator(".topbar-chip")).toHaveText("Grok Imagine Quality · 2k");
});

test("logo catalyst submits selected style, colors, prompt-enhancement flag, and Recraft mode settings correctly", async ({ page }) => {
  await page.goto("/logo");

  await expect(page.getByText("✦ catalyst")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("logos");

  // Select "Recraft V4.1" model in sidebar
  await page.getByLabel("Generation model").selectOption("recraft-v4");
  await expect(page.getByLabel("Generation model")).toHaveValue("recraft-v4");

  await expect(page.getByRole("complementary").getByRole("button", { name: "Recraft V4.1 Pro", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary").getByRole("button", { name: "Recraft V4.1 Vector", exact: true })).toHaveCount(0);

  await page.locator(".sidebar-section", { hasText: "Pro" }).getByRole("button", { name: "Yes", exact: true }).click();
  await page.locator(".sidebar-section", { hasText: "Vector" }).getByRole("button", { name: "Yes", exact: true }).click();
  await expect(page.locator(".sidebar-section", { hasText: "Pro" }).getByRole("button", { name: "Yes", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".sidebar-section", { hasText: "Vector" }).getByRole("button", { name: "Yes", exact: true })).toHaveClass(/active/);

  // Click on "Bold" style chip
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveClass(/active/);

  // Check the "Enhance input" checkbox
  await page.getByLabel("Enhance input (LLM rewriting)").check();
  expect(await page.getByLabel("Enhance input (LLM rewriting)").isChecked()).toBe(true);

  // Fill in color palette
  const paletteInput = page.locator("#colorPalette");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("#355C7D, #C06C84, #111318");

  await page.getByLabel("Prompt").fill("A beautiful geometry brand icon");

  let requestPayload: any = null;
  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "POST") {
      requestPayload = route.request().postDataJSON();
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Generate logos" }).click();
  await expect(page.locator(".generate-button")).toBeEnabled({ timeout: 15000 });

  expect(requestPayload).not.toBeNull();
  expect(requestPayload.modelId).toBe("recraft-v4");
  expect(requestPayload.inputs.recraftPro).toBe(true);
  expect(requestPayload.inputs.recraftVector).toBe(true);
  expect(requestPayload.inputs.style).toBe("Bold");
  expect(requestPayload.inputs.enhancePrompt).toBe(true);
  expect(requestPayload.inputs.colorPalette).toEqual(["#355C7D", "#C06C84", "#111318"]);
});

test("logo result actions can vectorize a raster logo", async ({ page }) => {
  const logoRun = {
    id: "logo-raster-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "succeeded",
    request: {
      taskId: "logo",
      modelId: "grok-imagine",
      inputs: { prompt: "Raster logo", aspectRatio: "1:1" },
      attachments: []
    },
    model: { id: "grok-imagine", label: "Grok Imagine", provider: "fal", endpoint: "xai/grok-imagine-image" },
    output: {
      images: [{ url: "https://v3.fal.media/files/example/logo.png", width: 1024, height: 1024 }]
    },
    events: []
  };
  let vectorizePayload: any = null;

  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: [logoRun] })
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/runs/logo-raster-1/vectorize", async (route) => {
    vectorizePayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          ...logoRun,
          output: {
            images: [
              { url: "https://v3.fal.media/files/example/logo.svg", contentType: "image/svg+xml" },
              ...logoRun.output.images
            ]
          }
        }
      })
    });
  });

  await page.goto("/logo");
  await page.locator(".result-image-button").first().click();
  await expect(page.getByRole("button", { name: "Vectorize logo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Vectorize logo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Vectorize logo", exact: true })).toBeVisible({ timeout: 5000 });
  expect(vectorizePayload).toEqual({ imageUrl: "https://v3.fal.media/files/example/logo.png" });
});

test("logo result modal shows prompt, vector outline, and edit chat payload", async ({ page }) => {
  const svg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><path d="M96 256 C160 96 352 96 416 256 C352 416 160 416 96 256 Z" fill="#111318"/></svg>`);
  const logoRun = {
    id: "logo-vector-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "succeeded",
    request: {
      taskId: "logo",
      modelId: "recraft-v4",
      inputs: { prompt: "A smooth black eye shaped gallery logo", aspectRatio: "1:1" },
      attachments: []
    },
    model: { id: "recraft-v4", label: "Recraft V4.1 Vector", provider: "fal", endpoint: "fal-ai/recraft/v4.1/text-to-vector" },
    output: {
      images: [{ url: `data:image/svg+xml;charset=utf-8,${svg}`, contentType: "image/svg+xml" }]
    },
    events: []
  };
  let editPayload: any = null;

  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: [logoRun] })
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/runs/logo-vector-1/edit-image", async (route) => {
    editPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          ...logoRun,
          output: {
            images: [
              { url: "https://v3.fal.media/files/example/edited-logo.png", width: 1024, height: 1024 },
              ...logoRun.output.images
            ]
          }
        }
      })
    });
  });

  await page.goto("/logo");
  await page.locator(".result-image-button").first().click();
  await expect(page.locator(".modal-result-image")).toBeVisible();
  await expect(page.locator(".vector-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle vector x-ray" }).click();
  await expect(page.locator(".vector-inspector")).toBeVisible();
  await expect(page.locator(".vector-outline-layer path")).toHaveCount(1);
  await expect(page.getByText("A smooth black eye shaped gallery logo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();

  await expect(page.getByLabel("Edit model")).toContainText("Nano Banana 2");
  await expect(page.getByLabel("Edit model")).toContainText("Grok Imagine Quality");
  await expect(page.getByLabel("Edit model")).toContainText("Seedream 5 Lite");
  await page.getByLabel("Edit model").selectOption("grok-imagine-quality-edit");
  await page.locator(".edit-controls-strip").getByLabel("Resolution").selectOption("2k");
  await page.getByLabel("Edit prompt").fill("Make the mark more angular and keep the background white.");
  await page.getByRole("button", { name: "Send edit" }).click();
  await expect(page.getByText("Edited with Grok Imagine Quality")).toBeVisible();

  expect(editPayload.modelId).toBe("grok-imagine-quality-edit");
  expect(editPayload.resolution).toBe("2k");
  expect(editPayload.prompt).toBe("Make the mark more angular and keep the background white.");
  expect(editPayload.imageUrl).toContain("data:image/png");
});

test("logo result cards can be deleted from the gallery", async ({ page }) => {
  let storedRuns: any[] = [
    {
      id: "failed-logo-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "failed",
      request: {
        taskId: "logo",
        modelId: "recraft-v4",
        inputs: { prompt: "Failed vector", aspectRatio: "1:1" },
        attachments: []
      },
      model: { id: "recraft-v4", label: "Recraft V4.1 Vector", provider: "fal", endpoint: "fal-ai/recraft/v4.1/text-to-vector" },
      events: [],
      error: "Generation failed"
    }
  ];

  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: storedRuns })
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/runs/failed-logo-1", async (route) => {
    if (route.request().method() === "DELETE") {
      storedRuns = [];
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.continue();
  });

  await page.goto("/logo");
  await expect(page.locator(".run-card.failed")).toBeVisible();
  await page.getByRole("button", { name: "Delete Recraft V4.1 Vector generation" }).click();
  await expect(page.locator(".run-card")).toHaveCount(0);
});

test("loads tool hub via / and navigates to mockup generator", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".topbar .brand")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("studio");
  await expect(page.getByText("An elegant suite of generative tools")).toBeVisible();

  // It should have cards/links for the tools
  await expect(page.getByText("Mockup Catalyst")).toBeVisible();
  await expect(page.getByText("Logo Catalyst")).toBeVisible();
  await expect(page.getByText("Editable Conversion")).toBeVisible();
  await expect(page.getByText("Asset Catalyst")).toHaveCount(0);

  // Click the Mockup Catalyst card
  await page.click("text=Mockup Catalyst");

  // Should navigate to /mockup and show mockup generator
  await expect(page.locator(".brand-tag")).toHaveText("mockups");
  await expect(page.getByLabel("Prompt")).toBeVisible();
});

test("asset route is not exposed as a standalone generator", async ({ page }) => {
  await page.goto("/asset");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".brand-tag")).toHaveText("studio");
  await expect(page.getByText("Asset Catalyst")).toHaveCount(0);
  await expect(page.getByLabel("Generation model")).toHaveCount(0);
});

test("loads brand workbench via /brand", async ({ page }) => {
  await page.goto("/brand");

  await expect(page.locator(".topbar .brand")).toBeVisible();
  await expect(page.locator(".brand-tag")).toHaveText("brands");
  await expect(page.getByText("Brand identity workflow")).toBeVisible();
  await expect(page.getByLabel("Brand prompt")).toBeVisible();
});

test("loads tool hub via / and navigates to brand catalyst workbench", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Brand Catalyst")).toBeVisible();
  await page.click("text=Brand Catalyst");

  await expect(page.locator(".brand-tag")).toHaveText("brands");
  await expect(page.getByText("Brand identity workflow")).toBeVisible();
});

test("brand catalyst submits through the Catalyst run API and renders the persisted result", async ({ page }) => {
  let storedRuns: any[] = [];
  let requestBody: any = null;
  const brandRun = {
    id: "brand-run-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "succeeded",
    request: {
      taskId: "brand",
      modelId: "brand-identity-pipeline",
      inputs: { prompt: "A precise studio for architectural lighting.", budget: 1.5 },
      attachments: []
    },
    model: {
      id: "brand-identity-pipeline",
      label: "Brand Identity Pipeline",
      provider: "internal",
      endpoint: "internal/brand-identity-pipeline"
    },
    output: {
      text: "LUMA: Light with discipline.",
      brand: {
        concept: {
          name: "LUMA",
          tagline: "Light with discipline.",
          personality: ["precise", "quiet", "architectural"],
          audience: "Design-led architects and studio owners",
          colors: { primary: "#111318", secondary: "#E7E0D2", accent: "#D4625A" },
          fonts: { display: "Canela", body: "Geist" },
          icons: [{ name: "beam", description: "focused light" }],
          prompts: { referenceSheet: "", heroBackground: "", lightPattern: "", darkPattern: "" },
          imageModels: { referenceSheet: "nano-banana-2", refResolution: "1K", assets: "seedream-5" }
        },
        skillMarkdown: "# LUMA Brand System\n\nUse disciplined light.",
        showcaseHtml: "<!DOCTYPE html><html><body><h1>LUMA</h1></body></html>",
        assets: {
          referenceSheet: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'></svg>",
          heroBackground: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'></svg>",
          lightPattern: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'></svg>",
          darkPattern: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'></svg>",
          icons: [{ name: "beam", url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'></svg>", source: "generated" }]
        },
        budget: 1.5,
        generatedAt: new Date().toISOString()
      }
    },
    events: [
      { at: new Date().toISOString(), message: "Queued Brand Identity Pipeline" },
      { at: new Date().toISOString(), message: "Brand identity complete" }
    ]
  };

  await page.route("**/api/runs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ runs: storedRuns })
      });
      return;
    }
    requestBody = route.request().postDataJSON();
    storedRuns = [brandRun];
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ run: brandRun })
    });
  });

  await page.goto("/brand");
  await page.getByLabel("Brand prompt").fill("A precise studio for architectural lighting.");
  await page.getByRole("button", { name: "Build brand identity" }).click();

  expect(requestBody.taskId).toBe("brand");
  expect(requestBody.modelId).toBe("brand-identity-pipeline");
  await expect(page.locator(".brand-output-header h1")).toHaveText("LUMA");
  await expect(page.locator(".brand-output-header p")).toHaveText("Light with discipline.");
  await page.getByRole("button", { name: "Skill file" }).click();
  await expect(page.getByText("# LUMA Brand System")).toBeVisible();
  await page.getByRole("button", { name: "Icons" }).click();
  await expect(page.getByText("beam")).toBeVisible();
});
