import crypto from "node:crypto";
import {
  getModel,
  getUpscaler,
  validateRequiredInputs,
  type CreateRunRequest,
  type GeneratedImage,
  type ModelSpec,
  type RunOutput,
  type RunRecord
} from "@ray-catalyst/core";
import { config } from "./config";
import { callFalQueue } from "./providers/fal";
import { runMockModel, runMockUpscaler } from "./providers/mock";
import { getRun, saveRun } from "./store/runStore";

function now() {
  return new Date().toISOString();
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
  if (raw && typeof raw === "object" && "deck" in raw) return raw as RunOutput;
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

function openAiSizeFor(aspectRatio: string) {
  if (aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "1:1") return "1024x1024";
  return "1024x1536";
}

function falImageSizeFor(aspectRatio: string) {
  if (aspectRatio === "16:9") return "landscape_16_9";
  if (aspectRatio === "1:1") return "square";
  if (aspectRatio === "16:10") return "landscape_16_9";
  return "portrait_4_3";
}

function buildPrompt(request: CreateRunRequest) {
  const prompt = String(request.inputs.prompt || "").trim();
  if (request.taskId !== "mockup") return prompt;
  return `Create a polished website or product interface mockup. ${prompt}`.trim();
}

function buildProviderInput(request: CreateRunRequest, model: ModelSpec) {
  const input: Record<string, unknown> = {};
  for (const [sourceKey, targetKey] of Object.entries(model.providerInputMap)) {
    const value = request.inputs[sourceKey];
    if (value !== undefined && value !== "") input[targetKey] = value;
  }
  input.prompt = buildPrompt(request);

  const aspectRatio = String(request.inputs.aspectRatio || "2:3");
  input.aspect_ratio = input.aspect_ratio || aspectRatio;
  if (model.id === "gpt-image-2") {
    input.n = 1;
    input.size = input.size || openAiSizeFor(aspectRatio);
  } else if (model.output.kind === "images" || model.output.kind === "image") {
    input.image_size = input.image_size || falImageSizeFor(aspectRatio);
  }

  return input;
}

function resolveExecutionModel(model: ReturnType<typeof getModel>) {
  if (model.id === "auto-random" || model.id === "smart-mix") {
    return getModel("grok-imagine");
  }
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
  if (model.output.kind === "deck") {
    return normalizeOutput((await callFalQueue(model.endpoint, buildProviderInput(request, model))).data);
  }

  const requestedCount = Number(request.inputs.count || 1);
  const count = Math.max(1, Math.min(Number.isFinite(requestedCount) ? requestedCount : 1, 10));
  const images: GeneratedImage[] = [];
  const rawResponses: unknown[] = [];
  let lastError: unknown = null;

  for (let index = 0; index < count; index += 1) {
    try {
      const result = await callFalQueue(model.endpoint, buildProviderInput(request, model));
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

export async function executeRun(request: CreateRunRequest): Promise<RunRecord> {
  const model = getModel(request.modelId);
  const executionModel = resolveExecutionModel(model);
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
      label: model.label,
      provider: model.provider,
      endpoint: model.endpoint,
      synthId: model.synthId,
      defaultPostprocessors: model.defaultPostprocessors
    },
    events: [event(`Queued ${model.label}`)]
  };
  await saveRun(run);

  try {
    if (executionModel.id !== model.id) {
      run.events.push(event(`Resolved ${model.label} to ${executionModel.label}`));
      await saveRun(run);
    }
    run.events.push(
      event(
        config.providerMode === "mock"
          ? "Running in cost-free mock mode"
          : `Calling ${executionModel.provider}:${executionModel.endpoint}`
      )
    );
    await saveRun(run);

    const output =
      config.providerMode === "mock" || executionModel.provider === "mock"
        ? await runMockModel(model, request)
        : await callLiveModel(executionModel, request);

    run.output = await maybeUpscale(output, request, run);
    run.status = "succeeded";
    run.updatedAt = now();
    run.events.push(event("Run completed"));
    return saveRun(run);
  } catch (error) {
    run.status = "failed";
    run.updatedAt = now();
    run.error = error instanceof Error ? error.message : String(error);
    run.events.push(event(`Run failed: ${run.error}`));
    return saveRun(run);
  }
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
        upscale_factor: 2,
        checkpoint: "v2"
      });
      newOutput = normalizeOutput(result.data);
    }

    const enhanced = newOutput.images?.[0];
    if (!enhanced) throw new Error("Enhancer returned no image");

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
    run.status = "failed";
    run.updatedAt = now();
    const errMsg = error instanceof Error ? error.message : String(error);
    run.error = errMsg;
    run.events.push(event(`Enhancement failed: ${errMsg}`));
    return await saveRun(run);
  }
}
