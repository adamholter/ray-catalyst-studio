import assert from "node:assert/strict";
import test from "node:test";
import { getModel, type CreateRunRequest } from "@ray-catalyst/core";
import { buildPromptEnhancementContext, resolveProviderAspectInput } from "./runner";

test("maps aspect_ratio models to their native ratio input", () => {
  assert.deepEqual(resolveProviderAspectInput(getModel("grok-imagine"), "20:9"), {
    key: "aspect_ratio",
    value: "20:9",
    aspectRatio: "20:9"
  });
});

test("maps image_size preset models to fal enum values", () => {
  assert.deepEqual(resolveProviderAspectInput(getModel("seedream-5-lite"), "9:16"), {
    key: "image_size",
    value: "portrait_16_9",
    aspectRatio: "9:16"
  });
  assert.deepEqual(resolveProviderAspectInput(getModel("recraft-v4"), "2:3"), {
    key: "image_size",
    value: "portrait_4_3",
    aspectRatio: "3:4"
  });
});

test("maps GPT-Image-2 custom ratios to explicit dimensions", () => {
  assert.deepEqual(resolveProviderAspectInput(getModel("gpt-image-2"), "21:9"), {
    key: "image_size",
    value: { width: 1792, height: 768 },
    aspectRatio: "21:9"
  });
});

test("prompt enhancement context includes the full mockup creative brief", () => {
  const request: CreateRunRequest = {
    taskId: "mockup",
    modelId: "gpt-image-2",
    inputs: {
      prompt: "A playful preschool website.",
      aspectRatio: "2:3",
      count: 1,
      quality: "low",
      style: "Playful",
      clientType: "Quality learning center",
      clientPreferences: "Warm, safe, colorful, parents should trust it quickly.",
      logoDescription: "Rainbow logo with chunky lowercase lettering.",
      brandArchetype: "Caregiver",
      variationAmount: "high",
      colorPalette: ["#7B61FF", "#FF6F91", "#FFD23F"],
      enhancePrompt: true
    },
    attachments: [
      { name: "logo.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AA==" },
      { name: "classroom-reference.webp", mimeType: "image/webp", dataUrl: "data:image/webp;base64,AA==" }
    ]
  };

  const context = buildPromptEnhancementContext(request, getModel("gpt-image-2"));

  assert.match(context, /Selected model: GPT-Image-2/);
  assert.match(context, /Aspect ratio: 2:3/);
  assert.match(context, /Quality: low/);
  assert.match(context, /Client \/ website type: Quality learning center/);
  assert.match(context, /Client preferences: Warm, safe, colorful/);
  assert.match(context, /Logo \/ brand notes: Rainbow logo/);
  assert.match(context, /Brand archetype: Caregiver/);
  assert.match(context, /Variation amount: high/);
  assert.match(context, /Color palette: #7B61FF, #FF6F91, #FFD23F/);
  assert.match(context, /1\. logo\.png \(image\/png\)/);
  assert.match(context, /2\. classroom-reference\.webp \(image\/webp\)/);
  assert.match(context, /standalone page\/interface mockup/);
});
