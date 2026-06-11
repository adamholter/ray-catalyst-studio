import assert from "node:assert/strict";
import test from "node:test";
import { enhancementRules, sanitizeEnhancedPrompt } from "./openrouter";

test("mockup prompt enhancement rules preserve standalone interface semantics", () => {
  const rules = enhancementRules("Task: mockup. Style: Minimal. Colors: unspecified.");

  assert.match(rules, /standalone design itself/i);
  assert.match(rules, /Do not add browser chrome/i);
  assert.match(rules, /edge-to-edge flat page design/i);
});

test("mockup prompt enhancement rejects accidental browser or device presentation rewrites", () => {
  const original =
    "A museum website for a contemporary art gallery with an airy editorial feel and a sculptural hero photograph.";
  const enhanced =
    "A polished website mockup displayed in a modern browser window on a laptop, with an address bar and tabs visible.";

  const sanitized = sanitizeEnhancedPrompt(original, enhanced, "Task: mockup. Style: Minimal.");

  assert.match(sanitized, /^A museum website/);
  assert.match(sanitized, /Standalone flat page\/interface design only/i);
  assert.doesNotMatch(sanitized, /displayed in a modern browser window/i);
});

test("mockup prompt enhancement keeps browser framing when the user explicitly asked for it", () => {
  const original = "A SaaS dashboard shown inside a Safari browser window.";
  const enhanced = "A refined SaaS dashboard shown inside a Safari browser window with visible navigation chrome.";

  assert.equal(sanitizeEnhancedPrompt(original, enhanced, "Task: mockup. Style: Modern."), enhanced);
});
