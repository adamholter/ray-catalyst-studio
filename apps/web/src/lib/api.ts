import type { Attachment, CreateRunRequest, EditModelSpec, ModelSpec, RunRecord, TaskSpec, UpscalerSpec } from "@ray-catalyst/core";

export type Capabilities = {
  providerMode: "mock" | "live";
  tasks: TaskSpec[];
  models: ModelSpec[];
  editModels: EditModelSpec[];
  upscalers: UpscalerSpec[];
  defaults: Record<string, { modelId: string; modelIds: string[] }>;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(readErrorMessage(data, `Request failed: ${response.status}`));
  }
  return data as T;
}

function readErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const value = (data as { error?: unknown; message?: unknown; detail?: unknown }).error ?? (data as { message?: unknown }).message ?? (data as { detail?: unknown }).detail;
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const nested = value as { message?: unknown; detail?: unknown };
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
    if (typeof nested.detail === "string" && nested.detail.trim()) return nested.detail;
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export async function fetchCapabilities() {
  return parseResponse<Capabilities>(await fetch("/api/capabilities"));
}

export async function fetchRuns() {
  return parseResponse<{ runs: RunRecord[] }>(await fetch("/api/runs"));
}

export async function deleteRun(runId: string) {
  const response = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
  if (!response.ok) {
    await parseResponse(response);
  }
}

export async function createRun(request: CreateRunRequest) {
  return parseResponse<{ run: RunRecord }>(
    await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    })
  );
}

export async function importMockupUpload(image: Attachment & { width?: number; height?: number }, prompt: string, aspectRatio: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch("/api/mockups/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, prompt, aspectRatio })
    })
  );
}

export async function enhanceRunImage(runId: string, imageUrl: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/upscale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, upscalerId: "aura-sr" })
    })
  );
}

export async function vectorizeRunImage(runId: string, imageUrl: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/vectorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl })
    })
  );
}

export async function editRunImage(
  runId: string,
  imageUrl: string,
  prompt: string,
  modelId: string,
  options: { quality?: string; resolution?: string } = {}
) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/edit-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, prompt, modelId, ...options })
    })
  );
}

export async function convertRunMockup(runId: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    })
  );
}

export async function editRunMockup(runId: string, prompt: string, html: string, css: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/edit-mockup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, html, css })
    })
  );
}

export async function saveRunMockup(runId: string, html: string, css: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/mockup`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, css })
    })
  );
}
