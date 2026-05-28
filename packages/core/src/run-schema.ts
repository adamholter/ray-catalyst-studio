import { z } from "zod";
import { MODEL_REGISTRY, TASKS, UPSCALER_REGISTRY, type ModelSpec } from "./registry";

const taskIds = TASKS.map((task) => task.id) as [string, ...string[]];
const modelIds = MODEL_REGISTRY.map((model) => model.id) as [string, ...string[]];
const upscalerIds = UPSCALER_REGISTRY.map((upscaler) => upscaler.id) as [string, ...string[]];

export const attachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  dataUrl: z.string()
});

export const createRunRequestSchema = z.object({
  taskId: z.enum(taskIds),
  modelId: z.enum(modelIds),
  inputs: z.record(z.string(), z.unknown()),
  postprocess: z
    .object({
      upscalerId: z.enum(upscalerIds).nullable().optional(),
      applyUpscale: z.boolean().optional()
    })
    .optional(),
  attachments: z.array(attachmentSchema).default([])
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export type GeneratedImage = {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
};

export type RunOutput = {
  images?: GeneratedImage[];
  text?: string;
  deck?: {
    title: string;
    slides: Array<{ title: string; notes: string; assetPrompt: string }>;
  };
  raw?: unknown;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "queued" | "running" | "succeeded" | "failed";
  request: CreateRunRequest;
  model: Pick<ModelSpec, "id" | "label" | "provider" | "endpoint" | "synthId" | "defaultPostprocessors">;
  output?: RunOutput;
  error?: string;
  events: Array<{ at: string; message: string }>;
};

export function validateRequiredInputs(model: ModelSpec, inputs: Record<string, unknown>): string[] {
  return model.inputFields
    .filter((field) => field.required)
    .filter((field) => {
      const value = inputs[field.key];
      return value === undefined || value === null || value === "";
    })
    .map((field) => `${field.label} is required`);
}
