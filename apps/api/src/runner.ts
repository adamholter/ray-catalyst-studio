import crypto from "node:crypto";
import {
  getEditModel,
  getModel,
  getUpscaler,
  validateRequiredInputs,
  type CreateRunRequest,
  type FieldOption,
  type GeneratedImage,
  type ModelSpec,
  type RunOutput,
  type RunRecord
} from "@ray-catalyst/core";
import { config } from "./config";
import { callFalQueue } from "./providers/fal";
import { runBrandIdentityPipeline } from "./providers/brandPipeline";
import { runMockModel, runMockUpscaler, runMockVectorizer } from "./providers/mock";
import { enhancePrompt as enhancePromptWithOpenRouter } from "./providers/openrouter";
import { getRun, saveRun } from "./store/runStore";

function now() {
  return new Date().toISOString();
}

function errorMessage(error: unknown, fallback = "The request failed") {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; error?: unknown; detail?: unknown };
    for (const value of [item.message, item.error, item.detail]) {
      if (typeof value === "string" && value.trim()) return value;
      if (value && typeof value === "object") {
        const nested = value as { message?: unknown; detail?: unknown };
        if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
        if (typeof nested.detail === "string" && nested.detail.trim()) return nested.detail;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function event(message: string) {
  return { at: now(), message };
}

function getImageUrl(item: unknown): GeneratedImage | null {
  if (!item) return null;
  if (typeof item === "string") return { url: item };
  if (typeof item === "object") {
    const candidate = item as { url?: string; b64_json?: string; width?: number; height?: number; content_type?: string };
    if (candidate.url) {
      return {
        url: candidate.url,
        width: candidate.width,
        height: candidate.height,
        contentType: candidate.content_type
      };
    }
    if (candidate.b64_json) {
      return { url: `data:image/png;base64,${candidate.b64_json}` };
    }
  }
  return null;
}

function normalizeOutput(raw: unknown): RunOutput {
  const data = raw as {
    image?: unknown;
    images?: unknown[];
    data?: unknown[];
    output?: unknown[];
    svg?: string;
  };
  const imageItems = [data?.image, ...(data?.images || []), ...(data?.data || []), ...(data?.output || [])]
    .map(getImageUrl)
    .filter(Boolean) as GeneratedImage[];
  if (imageItems.length) return { images: imageItems, raw };
  if (data?.svg) return { text: data.svg, raw };
  return { raw };
}

function parseAspectRatio(value: string) {
  const [rawWidth, rawHeight] = value.split(":");
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

function aspectFieldFor(model: ModelSpec) {
  return model.inputFields.find((field) => field.key === "aspectRatio" && field.kind === "aspectRatio");
}

function nearestAspectOption(options: FieldOption[], requested: string) {
  const exact = options.find((option) => option.value === requested);
  if (exact) return exact;

  const requestedRatio = parseAspectRatio(requested);
  if (!requestedRatio) return options[0];

  return options.reduce((best, option) => {
    const optionRatio = parseAspectRatio(option.value);
    const bestRatio = parseAspectRatio(best.value);
    if (!optionRatio || !bestRatio) return best;
    const optionDistance = Math.abs(Math.log(optionRatio / requestedRatio));
    const bestDistance = Math.abs(Math.log(bestRatio / requestedRatio));
    return optionDistance < bestDistance ? option : best;
  }, options[0]);
}

function selectedAspectOption(model: ModelSpec, requested: unknown) {
  const field = aspectFieldFor(model);
  const options = field?.options || [];
  if (!field || !options.length) return null;
  const value = typeof requested === "string" && requested.trim() ? requested.trim() : String(field.defaultValue || options[0].value);
  return nearestAspectOption(options, value);
}

export function resolveProviderAspectInput(model: ModelSpec, requested: unknown) {
  const field = aspectFieldFor(model);
  const option = selectedAspectOption(model, requested);
  if (!field || !option) return null;
  const target = field.aspectRatioInput || "aspect_ratio";
  if (target === "image_size" && option.width && option.height) {
    return { key: target, value: { width: option.width, height: option.height }, aspectRatio: option.value };
  }
  return { key: target, value: option.providerValue || option.value, aspectRatio: option.value };
}

function normalizeRunAspectInput(request: CreateRunRequest, model: ModelSpec) {
  const resolved = resolveProviderAspectInput(model, request.inputs.aspectRatio);
  if (resolved) request.inputs.aspectRatio = resolved.aspectRatio;
}

function applyAspectInput(input: Record<string, unknown>, request: CreateRunRequest, model: ModelSpec) {
  const resolved = resolveProviderAspectInput(model, request.inputs.aspectRatio);
  if (resolved) input[resolved.key] = resolved.value;
}

function optionalLogoPalette(inputs: Record<string, unknown>) {
  const value = inputs.colorPalette ?? inputs.palette ?? inputs.colors;
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).join(", ");
  if (typeof value === "string") return value.trim();
  return "";
}

function hexPalette(inputs: Record<string, unknown>) {
  const value = inputs.colorPalette ?? inputs.colors;
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  return values
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
    .filter((item) => /^#[0-9a-fA-F]{6}$/.test(item));
}

function stringInput(inputs: Record<string, unknown>, key: string) {
  const value = inputs[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function selectedModelSettings(model: ModelSpec, inputs: Record<string, unknown>) {
  return model.inputFields
    .filter((field) => !["prompt", "count", "aspectRatio"].includes(field.key))
    .map((field) => {
      const value = inputs[field.key];
      if (value === undefined || value === "" || value === false) return "";
      return `${field.label}: ${String(value)}`;
    })
    .filter(Boolean);
}

function briefColorLines(inputs: Record<string, unknown>) {
  const lines: string[] = [];
  const palette = optionalLogoPalette(inputs);
  if (palette) lines.push(`Color palette: ${palette}`);
  const primary = stringInput(inputs, "primaryColor");
  const secondary = stringInput(inputs, "secondaryColor");
  const accent = stringInput(inputs, "accentColor");
  if (primary || secondary || accent) {
    lines.push(`Color scheme: Primary(${primary || "unspecified"}), Secondary(${secondary || "unspecified"}), Accent(${accent || "unspecified"})`);
  }
  return lines;
}

function attachmentSummary(attachments: CreateRunRequest["attachments"]) {
  if (!attachments.length) return "";
  return attachments
    .map((attachment, index) => `${index + 1}. ${attachment.name || "unnamed image"} (${attachment.mimeType || "image"})`)
    .join("\n");
}

export function buildPromptEnhancementContext(request: CreateRunRequest, model: ModelSpec) {
  const inputs = request.inputs;
  const lines = [
    `Task: ${request.taskId}`,
    `Selected model: ${model.label} (${model.id})`,
    `Provider endpoint: ${model.endpoint}`,
    `Aspect ratio: ${String(inputs.aspectRatio || "unspecified")}`,
    `Count: ${String(inputs.count || 1)}`,
    ...selectedModelSettings(model, inputs)
  ];

  const style = stringInput(inputs, "style");
  if (style) lines.push(`Style direction: ${style}`);

  const clientType = stringInput(inputs, "clientType");
  if (clientType) lines.push(`Client / website type: ${clientType}`);

  const preferences = stringInput(inputs, "clientPreferences") || stringInput(inputs, "preferences");
  if (preferences) lines.push(`Client preferences: ${preferences}`);

  const logoDescription = stringInput(inputs, "logoDescription");
  if (logoDescription) lines.push(`Logo / brand notes: ${logoDescription}`);

  const brandArchetype = stringInput(inputs, "brandArchetype");
  if (brandArchetype) lines.push(`Brand archetype: ${brandArchetype}`);

  const variationAmount = stringInput(inputs, "variationAmount");
  if (variationAmount) lines.push(`Variation amount: ${variationAmount}`);

  lines.push(...briefColorLines(inputs));

  const attachments = attachmentSummary(request.attachments || []);
  if (attachments) {
    lines.push(`Attached visual references:\n${attachments}`);
  }

  if (request.taskId === "mockup") {
    lines.push(
      "Enhancement goal: produce one complete image-generation prompt for a standalone page/interface mockup using the full creative brief, attached references, and model settings."
    );
  }

  return lines.filter(Boolean).join("\n");
}

function buildPrompt(request: CreateRunRequest) {
  const prompt = String(request.inputs.prompt || "").trim();
  const style = request.inputs.style ? String(request.inputs.style).trim() : "";
  const palette = optionalLogoPalette(request.inputs);
  const clientType = stringInput(request.inputs, "clientType");
  const preferences = stringInput(request.inputs, "clientPreferences") || stringInput(request.inputs, "preferences");
  const logoDescription = stringInput(request.inputs, "logoDescription");
  const brandArchetype = stringInput(request.inputs, "brandArchetype");
  const variationAmount = stringInput(request.inputs, "variationAmount");

  let parts: string[] = [];

  if (request.taskId === "logo") {
    parts.push("Create a polished logo or brand mark.");
    parts.push("Render the logo on a pure white #FFFFFF background with no gray tint, paper texture, vignette, shadowed backdrop, or off-white canvas.");
    if (style) {
      parts.push(`Style: ${style}.`);
    }
    if (palette) {
      parts.push(`Use this color palette: ${palette}.`);
    } else {
      parts.push("Choose an appropriate color palette if the prompt does not specify one.");
    }
  } else if (request.taskId === "mockup") {
    parts.push("Create a polished standalone website, app, or product-interface design mockup.");
    parts.push("The image should be the design itself, edge-to-edge or page-composition style, not a scene of that design displayed inside a browser, laptop, monitor, phone, tablet, desktop window, or device frame.");
    parts.push("Do not include browser chrome, address bars, tabs, OS window controls, computer surroundings, hands, desks, or presentation-device framing unless the user explicitly asks for them.");
    if (style) {
      parts.push(`Style: ${style}.`);
    }
    if (palette) {
      parts.push(`Use this color palette: ${palette}.`);
    }
  } else {
    if (style) {
      parts.push(`Style: ${style}.`);
    }
    if (palette) {
      parts.push(`Color palette: ${palette}.`);
    }
  }

  if (clientType) parts.push(`Client / website type: ${clientType}.`);
  if (preferences) parts.push(`Client preferences: ${preferences}.`);
  if (logoDescription) parts.push(`Logo / brand notes: ${logoDescription}.`);
  if (brandArchetype) parts.push(`Brand archetype: ${brandArchetype}.`);
  if (variationAmount && variationAmount !== "standard") parts.push(`Variation direction: ${variationAmount}.`);
  if (request.taskId !== "logo") {
    parts.push(...briefColorLines(request.inputs).map((line) => `${line}.`));
  }

  parts.push(prompt);
  return parts.filter(Boolean).join(" ").trim();
}

function truthy(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function recraftEndpoint(inputs: Record<string, unknown>) {
  const pro = truthy(inputs.recraftPro);
  const vector = truthy(inputs.recraftVector);
  if (pro && vector) return "fal-ai/recraft/v4.1/pro/text-to-vector";
  if (pro) return "fal-ai/recraft/v4.1/pro/text-to-image";
  if (vector) return "fal-ai/recraft/v4.1/text-to-vector";
  return "fal-ai/recraft/v4.1/text-to-image";
}

function runModelLabel(model: ModelSpec, inputs: Record<string, unknown>) {
  if (model.id !== "recraft-v4") return model.label;
  const suffix = [truthy(inputs.recraftPro) ? "Pro" : "", truthy(inputs.recraftVector) ? "Vector" : ""]
    .filter(Boolean)
    .join(" ");
  return suffix ? `${model.label} ${suffix}` : model.label;
}

function hexToRgb(hex: string) {
  const cleanHex = hex.replace(/^#/, "");
  return {
    r: Number.parseInt(cleanHex.substring(0, 2), 16),
    g: Number.parseInt(cleanHex.substring(2, 4), 16),
    b: Number.parseInt(cleanHex.substring(4, 6), 16)
  };
}

function buildProviderInput(request: CreateRunRequest, model: ModelSpec) {
  const input: Record<string, unknown> = {};
  for (const [sourceKey, targetKey] of Object.entries(model.providerInputMap)) {
    const value = request.inputs[sourceKey];
    if (value !== undefined && value !== "") input[targetKey] = value;
  }
  input.prompt = buildPrompt(request);
  applyAspectInput(input, request, model);

  if (model.id === "gpt-image-2") {
    input.num_images = 1;
    input.output_format = input.output_format || "png";
  } else if (model.id.startsWith("recraft-v4")) {
    if (request.taskId === "logo") {
      input.background_color = { r: 255, g: 255, b: 255 };
    }
    const rgbColors = hexPalette(request.inputs).map(hexToRgb);
    if (rgbColors.length > 0) {
      input.colors = rgbColors;
    }
  } else if (model.id === "grok-imagine" || model.id === "grok-imagine-quality") {
    input.num_images = 1;
    input.output_format = input.output_format || "png";
  } else if (model.id === "seedream-5-lite") {
    input.num_images = 1;
    input.max_images = 1;
    input.enable_safety_checker = true;
  }

  return input;
}

function resolveExecutionModel(model: ReturnType<typeof getModel>) {
  return model;
}

async function maybeUpscale(output: RunOutput, request: CreateRunRequest, run: RunRecord): Promise<RunOutput> {
  const model = getModel(request.modelId);
  const requested = request.postprocess?.applyUpscale;
  const upscalerId = request.postprocess?.upscalerId || model.defaultPostprocessors[0];
  if (!upscalerId || !requested) return output;

  const upscaler = getUpscaler(upscalerId);
  run.events.push(event(`Applying ${upscaler.label}`));
  await saveRun(run);

  if (config.providerMode === "mock") return runMockUpscaler(output, upscalerId);

  if (!output.images?.[0]?.url) return output;
  const result = await callFalQueue(upscaler.endpoint, {
    image_url: output.images[0].url,
    upscale_factor: 4,
    checkpoint: "v2"
  });
  return normalizeOutput(result.data);
}

async function callLiveModel(model: ModelSpec, request: CreateRunRequest): Promise<RunOutput> {
  const requestedCount = Number(request.inputs.count || 1);
  const count = Math.max(1, Math.min(Number.isFinite(requestedCount) ? requestedCount : 1, 10));
  const images: GeneratedImage[] = [];
  const rawResponses: unknown[] = [];
  let lastError: unknown = null;

  for (let index = 0; index < count; index += 1) {
    try {
      const result = await callFalQueue(model.id === "recraft-v4" ? recraftEndpoint(request.inputs) : model.endpoint, buildProviderInput(request, model));
      const output = normalizeOutput(result.data);
      rawResponses.push(result.data);
      if (output.images?.length) images.push(...output.images);
    } catch (error) {
      lastError = error;
      if (model.id !== "gpt-image-2") throw error;

      const fallbackModel = getModel("grok-imagine");
      const fallback = await callFalQueue(fallbackModel.endpoint, buildProviderInput(request, fallbackModel));
      const fallbackOutput = normalizeOutput(fallback.data);
      rawResponses.push({ fallbackFrom: model.id, data: fallback.data });
      if (fallbackOutput.images?.length) images.push(...fallbackOutput.images);
    }
  }

  if (!images.length && lastError) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return { images, raw: rawResponses.length === 1 ? rawResponses[0] : rawResponses };
}

async function createRunRecord(request: CreateRunRequest): Promise<RunRecord> {
  const model = getModel(request.modelId);
  normalizeRunAspectInput(request, model);
  const inputErrors = validateRequiredInputs(model, request.inputs);
  if (inputErrors.length) {
    throw new Error(inputErrors.join("; "));
  }

  const timestamp = now();
  const run: RunRecord = {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: "running",
    request,
    model: {
      id: model.id,
      label: runModelLabel(model, request.inputs),
      provider: model.provider,
      endpoint: model.id === "recraft-v4" ? recraftEndpoint(request.inputs) : model.endpoint,
      synthId: model.synthId,
      defaultPostprocessors: model.defaultPostprocessors
    },
    events: [event(`Queued ${model.label}`)]
  };
  return saveRun(run);
}

async function processRun(run: RunRecord): Promise<RunRecord> {
  const model = getModel(run.request.modelId);
  const executionModel = resolveExecutionModel(model);

  try {
    if (run.request.inputs.enhancePrompt) {
      run.events.push(event("Enhancing prompt with OpenRouter..."));
      await saveRun(run);
      const originalPrompt = String(run.request.inputs.prompt || "");
      const enhancedPrompt = await enhancePromptWithOpenRouter(originalPrompt, buildPromptEnhancementContext(run.request, model));
      if (enhancedPrompt && enhancedPrompt !== originalPrompt) {
        run.request.inputs.prompt = enhancedPrompt;
        run.events.push(event(`Prompt enhanced: "${enhancedPrompt}"`));
      } else {
        run.events.push(event("Prompt enhancement made no changes"));
      }
      await saveRun(run);
    }

    if (executionModel.id !== model.id) {
      run.events.push(event(`Resolved ${model.label} to ${executionModel.label}`));
      await saveRun(run);
    }

    if (executionModel.id === "brand-identity-pipeline") {
      run.events.push(
        event(config.providerMode === "mock" ? "Running brand pipeline in mock mode" : "Running brand identity pipeline")
      );
      await saveRun(run);
      run.output = await runBrandIdentityPipeline(run.request, async (message) => {
        run.updatedAt = now();
        run.events.push(event(message));
        await saveRun(run);
      });
      run.status = "succeeded";
      run.updatedAt = now();
      run.events.push(event("Brand identity complete"));
      return saveRun(run);
    }

    run.events.push(
      event(
        config.providerMode === "mock"
          ? "Running in cost-free mock mode"
          : `Calling ${executionModel.provider}:${executionModel.id === "recraft-v4" ? recraftEndpoint(run.request.inputs) : executionModel.endpoint}`
      )
    );
    await saveRun(run);

    const output =
      config.providerMode === "mock" || executionModel.provider === "mock"
        ? await runMockModel(model, run.request)
        : await callLiveModel(executionModel, run.request);

    run.output = await maybeUpscale(output, run.request, run);
    run.status = "succeeded";
    run.updatedAt = now();
    run.events.push(event("Run completed"));
    return saveRun(run);
  } catch (error) {
    run.status = "failed";
    run.updatedAt = now();
    run.error = errorMessage(error);
    run.events.push(event(`Run failed: ${run.error}`));
    return saveRun(run);
  }
}

export async function executeRun(request: CreateRunRequest): Promise<RunRecord> {
  return processRun(await createRunRecord(request));
}

export async function enqueueRun(request: CreateRunRequest): Promise<RunRecord> {
  const run = await createRunRecord(request);
  void processRun({ ...run }).catch(async (error) => {
    run.status = "failed";
    run.updatedAt = now();
    run.error = errorMessage(error);
    run.events.push(event(`Run failed: ${run.error}`));
    await saveRun(run);
  });
  return run;
}

export async function executeUpscale(runId: string, upscalerId?: string, imageUrl?: string): Promise<RunRecord> {
  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "succeeded") throw new Error("Run must be successful to upscale");

  const model = getModel(run.model.id);
  const targetUpscalerId = upscalerId || model.defaultPostprocessors[0] || "aura-sr";
  const upscaler = getUpscaler(targetUpscalerId);
  const targetImageUrl = imageUrl || run.output?.images?.[0]?.url;
  if (!targetImageUrl) throw new Error("No image available to enhance");

  run.status = "running";
  run.events.push(event(`Enhancing with ${upscaler.label}`));
  await saveRun(run);

  try {
    let newOutput: RunOutput;
    if (config.providerMode === "mock") {
      newOutput = await runMockUpscaler({ images: [{ url: targetImageUrl }] }, targetUpscalerId);
    } else {
      const result = await callFalQueue(upscaler.endpoint, {
        image_url: targetImageUrl,
        upscale_factor: 4,
        checkpoint: "v2"
      });
      newOutput = normalizeOutput(result.data);
    }

    const enhanced = newOutput.images?.[0];
    if (!enhanced) throw new Error("Enhancer returned no image");
    enhanced.createdAt = now();
    enhanced.parentIndex = Math.max(0, (run.output?.images || []).findIndex((image) => image.url === targetImageUrl));
    enhanced.operation = "enhanced";
    enhanced.modelId = targetUpscalerId;

    run.output = {
      ...run.output,
      images: [enhanced, ...(run.output?.images || [])],
      raw: {
        previous: run.output?.raw,
        enhancement: newOutput.raw
      }
    };
    run.status = "succeeded";
    run.updatedAt = now();
    run.events.push(event(`${upscaler.label} enhancement complete`));
    return await saveRun(run);
  } catch (error) {
    run.status = run.output?.images?.length ? "succeeded" : "failed";
    run.updatedAt = now();
    const errMsg = errorMessage(error, "Enhancement failed");
    if (run.status === "failed") run.error = errMsg;
    run.events.push(event(`Enhancement failed: ${errMsg}`));
    return await saveRun(run);
  }
}

export async function executeVectorize(runId: string, imageUrl?: string): Promise<RunRecord> {
  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "succeeded") throw new Error("Run must be successful to vectorize");

  const targetImageUrl = imageUrl || run.output?.images?.[0]?.url;
  if (!targetImageUrl) throw new Error("No image available to vectorize");

  run.status = "running";
  run.events.push(event("Vectorizing logo with Recraft Vectorize"));
  await saveRun(run);

  try {
    let newOutput: RunOutput;
    if (config.providerMode === "mock") {
      newOutput = await runMockVectorizer({ images: [{ url: targetImageUrl }] });
    } else {
      const result = await callFalQueue("fal-ai/recraft/vectorize", {
        image_url: targetImageUrl
      });
      newOutput = normalizeOutput(result.data);
    }

    const vectorized = newOutput.images?.[0];
    if (!vectorized) throw new Error("Vectorizer returned no image");

    if (vectorized.url.includes(".svg") || vectorized.url.startsWith("data:image/svg")) {
      vectorized.contentType = "image/svg+xml";
    }
    vectorized.createdAt = now();
    vectorized.parentIndex = Math.max(0, (run.output?.images || []).findIndex((image) => image.url === targetImageUrl));
    vectorized.operation = "vectorized";
    vectorized.modelId = "recraft-vectorize";

    run.output = {
      ...run.output,
      images: [vectorized, ...(run.output?.images || [])],
      raw: {
        previous: run.output?.raw,
        vectorization: newOutput.raw
      }
    };
    run.status = "succeeded";
    run.updatedAt = now();
    run.events.push(event("Logo vectorization complete"));
    return await saveRun(run);
  } catch (error) {
    run.status = run.output?.images?.length ? "succeeded" : "failed";
    run.updatedAt = now();
    const errMsg = errorMessage(error, "Vectorization failed");
    if (run.status === "failed") run.error = errMsg;
    run.events.push(event(`Vectorization failed: ${errMsg}`));
    return await saveRun(run);
  }
}

function editEndpoint(modelId: string) {
  if (modelId === "nano-banana-2") return "fal-ai/nano-banana-2/edit";
  if (modelId === "grok-imagine-edit") return "xai/grok-imagine-image/edit";
  if (modelId === "grok-imagine-quality-edit") return "xai/grok-imagine-image/quality/edit";
  if (modelId === "seedream-5-lite-edit") return "fal-ai/bytedance/seedream/v5/lite/edit";
  return "openai/gpt-image-2/edit";
}

function editBaseGenerationModel(modelId: string) {
  if (modelId === "nano-banana-2") return "nano-banana-2";
  if (modelId === "grok-imagine-edit") return "grok-imagine";
  if (modelId === "grok-imagine-quality-edit") return "grok-imagine-quality";
  if (modelId === "seedream-5-lite-edit") return "seedream-5-lite";
  return "gpt-image-2";
}

export async function executeImageEdit(
  runId: string,
  imageUrl: string | undefined,
  prompt: string,
  modelId = "gpt-image-2",
  options: { quality?: string; resolution?: string } = {}
): Promise<RunRecord> {
  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  const editModel = getEditModel(modelId);

  const targetImageUrl = imageUrl || run.output?.images?.[0]?.url;
  if (!targetImageUrl) throw new Error("No image available to edit");
  if (!prompt.trim()) throw new Error("Edit prompt is required");

  run.status = "running";
  const editQuality = ["low", "medium", "high"].includes(String(options.quality)) ? String(options.quality) : "low";
  const editResolution = ["1k", "2k"].includes(String(options.resolution).toLowerCase()) ? String(options.resolution).toLowerCase() : "1k";

  run.events.push(event(`Editing image with ${editModel.label}`));
  await saveRun(run);

  try {
    let input: Record<string, any>;
    if (modelId === "nano-banana-2") {
      input = {
        prompt,
        image_urls: [targetImageUrl],
        num_images: 1,
        aspect_ratio: "auto",
        output_format: "png",
        resolution: "1K",
        limit_generations: true
      };
    } else if (modelId === "grok-imagine-edit") {
      input = {
        prompt,
        image_urls: [targetImageUrl],
        num_images: 1,
        aspect_ratio: "auto",
        resolution: editResolution,
        output_format: "png"
      };
    } else if (modelId === "grok-imagine-quality-edit") {
      input = {
        prompt,
        image_urls: [targetImageUrl],
        aspect_ratio: "auto",
        resolution: editResolution,
        num_images: 1,
        output_format: "png"
      };
    } else if (modelId === "seedream-5-lite-edit") {
      input = {
        prompt,
        image_urls: [targetImageUrl],
        image_size: "auto_2K",
        num_images: 1,
        max_images: 1,
        enable_safety_checker: true
      };
    } else {
      input = {
        prompt,
        image_urls: [targetImageUrl],
        image_size: "auto",
        quality: editQuality,
        num_images: 1,
        output_format: "png"
      };
    }

    const baseModelId = editBaseGenerationModel(modelId);

    const newOutput =
      config.providerMode === "mock"
        ? await runMockModel(getModel(baseModelId), {
            taskId: run.request.taskId,
            modelId: baseModelId,
            inputs: {
              prompt,
              count: 1,
              aspectRatio: run.request.inputs.aspectRatio || "1:1",
              ...(baseModelId === "gpt-image-2" ? { quality: editQuality } : {}),
              ...(baseModelId === "grok-imagine-quality" || baseModelId === "grok-imagine" ? { resolution: editResolution } : {})
            },
            attachments: []
          })
        : normalizeOutput((await callFalQueue(editModel.endpoint || editEndpoint(modelId), input)).data);

    const edited = newOutput.images?.[0];
    if (!edited) throw new Error("Image edit returned no image");
    edited.createdAt = now();
    edited.parentIndex = Math.max(0, (run.output?.images || []).findIndex((image) => image.url === targetImageUrl));
    edited.operation = "edited";
    edited.modelId = modelId;
    edited.prompt = prompt;

    run.output = {
      ...run.output,
      images: [edited, ...(run.output?.images || [])],
      raw: {
        previous: run.output?.raw,
        edit: {
          modelId,
          prompt,
          quality: editQuality,
          resolution: editResolution,
          response: newOutput.raw
        }
      }
    };
    run.status = "succeeded";
    run.updatedAt = now();
    run.events.push(event(`Image edit complete with ${editModel.label}`));
    return await saveRun(run);
  } catch (error) {
    run.status = run.output?.images?.length ? "succeeded" : "failed";
    run.updatedAt = now();
    const errMsg = errorMessage(error, "Image edit failed");
    if (run.status === "failed") run.error = errMsg;
    run.events.push(event(`Image edit failed: ${errMsg}`));
    return await saveRun(run);
  }
}
