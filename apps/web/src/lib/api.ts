import type { CreateRunRequest, ModelSpec, RunRecord, TaskSpec, UpscalerSpec } from "@ray-catalyst/core";

export type Capabilities = {
  tasks: TaskSpec[];
  models: ModelSpec[];
  upscalers: UpscalerSpec[];
  defaults: Record<string, { modelId: string; modelIds: string[] }>;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data as T;
}

export async function fetchCapabilities() {
  return parseResponse<Capabilities>(await fetch("/api/capabilities"));
}

export async function fetchRuns() {
  return parseResponse<{ runs: RunRecord[] }>(await fetch("/api/runs"));
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

export async function enhanceRunImage(runId: string, imageUrl: string) {
  return parseResponse<{ run: RunRecord }>(
    await fetch(`/api/runs/${runId}/upscale`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, upscalerId: "aura-sr" })
    })
  );
}
