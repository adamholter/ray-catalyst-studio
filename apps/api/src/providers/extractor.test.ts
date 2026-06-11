import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetExtractionPrompt, buildMarkedAssetOverlaySvg } from "./extractor";

test("asset extraction prompts use full-mockup model reasoning instead of pixel crops", () => {
  const prompt = buildAssetExtractionPrompt(
    {
      id: "hero-image",
      name: "Hero classroom photo",
      type: "background",
      crop: { x: 420, y: 180, width: 540, height: 430 },
      extractionPrompt:
        "Extract the classroom photograph with three children playing blocks. Remove the pink badge, decorative wave mask, and any overlaid page graphics.",
      cleanup: {
        removeText: true,
        removeOverlays: true,
        notes: ["Use the source screenshot only as reference."]
      }
    } as any,
    1024,
    1536
  );

  assert.match(prompt, /full provided website mockup screenshot/i);
  assert.match(prompt, /location hint for visual reasoning, not a command to crop pixels/i);
  assert.match(prompt, /Do not return a rectangular screenshot crop/i);
  assert.match(prompt, /reconstruct the underlying clean asset/i);
  assert.match(prompt, /can be embedded directly in HTML\/CSS/i);
});

test("asset extraction prompts mention the red locator overlay when a marked image is supplied", () => {
  const prompt = buildAssetExtractionPrompt(
    {
      id: "about-photo",
      name: "About section classroom photo",
      type: "image",
      crop: { x: 80, y: 1020, width: 300, height: 260 },
      extractionPrompt: "Extract only the classroom photo.",
      cleanup: { removeText: true, removeOverlays: true, notes: [] },
      backgroundRemoval: { needed: false, reason: "Photo should stay rectangular." }
    } as any,
    1024,
    1536,
    true
  );

  assert.match(prompt, /red bounding box and label marking the target asset/i);
  assert.match(prompt, /do not include any red outline/i);
});

test("marked asset overlays render a visible red bounding box", () => {
  const overlay = buildMarkedAssetOverlaySvg(
    {
      id: "mascot",
      name: "Mascot cutout",
      crop: { x: 44, y: 88, width: 220, height: 180 }
    } as any,
    640,
    480
  );

  assert.match(overlay, /stroke="#ff1f1f"/);
  assert.match(overlay, /x="44"/);
  assert.match(overlay, /width="220"/);
  assert.match(overlay, />Mascot cutout</);
});
