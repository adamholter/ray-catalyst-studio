import { describe, expect, it } from "vitest";
import { EDIT_MODEL_REGISTRY, MODEL_REGISTRY, TASKS, UPSCALER_REGISTRY, defaultModelForTask, getEditModel, getModel, shouldApplyDefaultUpscaler } from "./registry";
import { validateRequiredInputs } from "./run-schema";

describe("model registry", () => {
  it("has a default model for every task", () => {
    for (const task of TASKS) {
      expect(defaultModelForTask(task.id).id).toBe(task.defaultModelId);
    }
  });

  it("keeps image enhancement as an explicit per-result action", () => {
    const nano = getModel("nano-banana-2");
    expect(nano.synthId.applyUpscaleByDefault).toBe(false);
    expect(shouldApplyDefaultUpscaler(nano)).toBe(false);
    expect(nano.defaultPostprocessors).toContain("aura-sr");
    expect(UPSCALER_REGISTRY.some((upscaler) => upscaler.id === "aura-sr")).toBe(true);
  });

  it("validates required model inputs from metadata", () => {
    const grok = getModel("grok-imagine");
    expect(validateRequiredInputs(grok, {})).toEqual(["Prompt is required"]);
    expect(validateRequiredInputs(grok, { prompt: "Museum mockup" })).toEqual([]);
  });

  it("defines mockups as standalone interface designs, not browser or device frames", () => {
    const mockupTask = TASKS.find((task) => task.id === "mockup");
    expect(mockupTask?.description).toContain("standalone");
    expect(mockupTask?.description).toContain("not browser/device-frame");
  });

  it("defines mockup optionalInputFields for rich mockup briefs", () => {
    const mockupTask = TASKS.find((task) => task.id === "mockup");
    expect(mockupTask?.optionalInputFields).toBeDefined();
    const keys = mockupTask?.optionalInputFields?.map((field) => field.key);
    expect(keys).toContain("clientType");
    expect(keys).toContain("clientPreferences");
    expect(keys).toContain("logoDescription");
    expect(keys).toContain("brandArchetype");
    expect(keys).toContain("variationAmount");
    expect(keys).toContain("colorPalette");
    expect(mockupTask?.optionalInputFields?.find((field) => field.key === "clientPreferences")?.kind).toBe("textarea");
    expect(mockupTask?.optionalInputFields?.find((field) => field.key === "brandArchetype")?.kind).toBe("select");
  });

  it("keeps Logo Catalyst color palettes optional", () => {
    const logoTask = TASKS.find((task) => task.id === "logo");
    const paletteField = logoTask?.optionalInputFields?.find((field) => field.key === "colorPalette");
    const logoModel = defaultModelForTask("logo");

    expect(paletteField?.label).toBe("Color palette");
    expect(paletteField?.required).toBeUndefined();
    expect(validateRequiredInputs(logoModel, { prompt: "Monogram for a Virginia art museum" })).toEqual([]);
  });

  it("uses model ids as API contracts rather than labels", () => {
    const ids = new Set(MODEL_REGISTRY.map((model) => model.id));
    expect(ids.size).toBe(MODEL_REGISTRY.length);
    expect(ids.has("grok-imagine")).toBe(true);
  });

  it("keeps current fal model upgrades in the existing registry contracts", () => {
    const recraft = getModel("recraft-v4");
    const grokQuality = getModel("grok-imagine-quality");

    expect(recraft.label).toBe("Recraft V4.1");
    expect(recraft.endpoint).toBe("fal-ai/recraft/v4.1/text-to-image");
    expect(MODEL_REGISTRY.some((model) => model.id === "recraft-v4-pro")).toBe(false);
    expect(MODEL_REGISTRY.some((model) => model.id === "recraft-v4-vector")).toBe(false);
    expect(recraft.inputFields.some((field) => field.key === "recraftPro")).toBe(true);
    expect(recraft.inputFields.some((field) => field.key === "recraftVector")).toBe(true);
    expect(grokQuality.endpoint).toBe("xai/grok-imagine-image/quality/text-to-image");
    expect(grokQuality.inputFields.some((field) => field.key === "resolution")).toBe(true);
  });

  it("declares model-specific aspect ratio controls from fal input contracts", () => {
    const aspectValues = (modelId: string) =>
      getModel(modelId)
        .inputFields.find((field) => field.key === "aspectRatio")
        ?.options?.map((option) => option.value);

    expect(aspectValues("nano-banana-2")).toEqual([
      "8:1",
      "4:1",
      "21:9",
      "16:9",
      "3:2",
      "4:3",
      "5:4",
      "1:1",
      "4:5",
      "3:4",
      "2:3",
      "9:16",
      "1:4",
      "1:8"
    ]);
    expect(aspectValues("grok-imagine")).toEqual([
      "20:9",
      "19.5:9",
      "2:1",
      "16:9",
      "3:2",
      "4:3",
      "1:1",
      "3:4",
      "2:3",
      "9:16",
      "1:2",
      "9:19.5",
      "9:20"
    ]);
    expect(aspectValues("seedream-5-lite")).toEqual(["16:9", "4:3", "1:1", "3:4", "9:16"]);
    expect(aspectValues("recraft-v4")).toEqual(["16:9", "4:3", "1:1", "3:4", "9:16"]);
    expect(aspectValues("ideogram-v3")).toEqual(["16:9", "4:3", "1:1", "3:4", "9:16"]);
  });

  it("keeps internal auto model choices out of the public generation registry", () => {
    expect(MODEL_REGISTRY.some((model) => model.id === "auto-random")).toBe(false);
    expect(MODEL_REGISTRY.some((model) => model.id === "smart-mix")).toBe(false);
  });

  it("declares compact image edit model capabilities separately from generation models", () => {
    expect(EDIT_MODEL_REGISTRY.map((model) => model.id)).toEqual([
      "gpt-image-2",
      "nano-banana-2",
      "grok-imagine-edit",
      "grok-imagine-quality-edit",
      "seedream-5-lite-edit"
    ]);
    expect(getEditModel("gpt-image-2").inputFields.some((field) => field.key === "quality")).toBe(true);
    expect(getEditModel("grok-imagine-quality-edit").inputFields.some((field) => field.key === "resolution")).toBe(true);
  });
});
