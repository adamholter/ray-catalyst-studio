import { describe, expect, it } from "vitest";
import { MODEL_REGISTRY, TASKS, UPSCALER_REGISTRY, defaultModelForTask, getModel, shouldApplyDefaultUpscaler } from "./registry";
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

  it("uses model ids as API contracts rather than labels", () => {
    const ids = new Set(MODEL_REGISTRY.map((model) => model.id));
    expect(ids.size).toBe(MODEL_REGISTRY.length);
    expect(ids.has("grok-imagine")).toBe(true);
  });
});
