import crypto from "node:crypto";
import {
  getModel,
  getUpscaler,
  shouldApplyDefaultUpscaler,
  validateRequiredInputs,
  type CreateRunRequest,
  type GeneratedImage,
  type RunOutput,
  type RunRecord
} from "@ray-catalyst/core";
import { config } from "./config";
import { callFalQueue } from "./providers/fal";
import { runMockModel, runMockUpscaler } from "./providers/mock";
import { saveRun } from "./store/runStore";

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

function buildProviderInput(request: CreateRunRequest) {
  const model = resolveExecutionModel(getModel(request.modelId));
  const input: Record<string, unknown> = {};
  for (const [sourceKey, targetKey] of Object.entries(model.providerInputMap)) {
    const value = request.inputs[sourceKey];
    if (value !== undefined && value !== "") input[targetKey] = value;
  }
  if (!input.prompt && request.inputs.prompt) input.prompt = request.inputs.prompt;
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
  const applyDefault = shouldApplyDefaultUpscaler(model);
  const requested = request.postprocess?.applyUpscale;
  const upscalerId = request.postprocess?.upscalerId || model.defaultPostprocessors[0];
  if (!upscalerId || (!applyDefault && !requested)) return output;

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
        : normalizeOutput((await callFalQueue(executionModel.endpoint, buildProviderInput(request))).data);

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
