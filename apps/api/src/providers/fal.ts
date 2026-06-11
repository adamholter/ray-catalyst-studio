import { config } from "../config";

export type FalQueueResult = {
  data: unknown;
  requestId?: string;
};

function apiError(data: unknown, fallback: string): string {
  const stringify = (value: unknown) => {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      const nested = value as { message?: unknown; detail?: unknown; error?: unknown };
      if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
      if (typeof nested.detail === "string" && nested.detail.trim()) return nested.detail;
      if (typeof nested.error === "string" && nested.error.trim()) return nested.error;
      try {
        return JSON.stringify(value);
      } catch {
        return fallback;
      }
    }
    return "";
  };
  if (data && typeof data === "object") {
    const item = data as { error?: unknown; detail?: unknown; message?: unknown };
    return stringify(item.error) || stringify(item.detail) || stringify(item.message) || fallback;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function callFalQueue(endpoint: string, input: Record<string, unknown>, timeoutMs = 180_000): Promise<FalQueueResult> {
  if (!config.falKey) {
    throw new Error("FAL_KEY is not configured on the backend");
  }

  const queueUrl = `https://queue.fal.run/${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Key ${config.falKey}`,
    "Content-Type": "application/json"
  };
  if (config.falObjectLifecyclePreference) {
    headers["X-Fal-Object-Lifecycle-Preference"] = config.falObjectLifecyclePreference;
  }

  const submit = await fetch(queueUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(input)
  });
  const submitted = (await readJson(submit)) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };

  if (!submit.ok) {
    throw new Error(apiError(submitted, `FAL submit failed: ${submit.status}`));
  }

  const requestId = submitted.request_id;
  const statusUrl = submitted.status_url || (requestId ? `${queueUrl}/requests/${requestId}/status` : "");
  const responseUrl = submitted.response_url || (requestId ? `${queueUrl}/requests/${requestId}` : "");
  if (!statusUrl || !responseUrl) {
    return { data: submitted, requestId };
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const statusResponse = await fetch(statusUrl, {
      headers: { Authorization: `Key ${config.falKey}` }
    });
    const status = (await readJson(statusResponse)) as {
      status?: string;
      error?: { message?: string };
      response_url?: string;
      result?: unknown;
    };

    if (!statusResponse.ok) {
      throw new Error(apiError(status, `FAL status failed: ${statusResponse.status}`));
    }

    const state = String(status.status || "").toUpperCase();
    if (state === "COMPLETED" || state === "SUCCEEDED") {
      if (status.result) return { data: status.result, requestId };

      const resultResponse = await fetch(status.response_url || responseUrl, {
        headers: { Authorization: `Key ${config.falKey}` }
      });
      const result = await readJson(resultResponse);
      if (!resultResponse.ok) {
        throw new Error(apiError(result, `FAL result failed: ${resultResponse.status}`));
      }
      return { data: result, requestId };
    }

    if (state === "FAILED" || state === "ERROR") {
      throw new Error(apiError(status, "FAL request failed"));
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`FAL request timed out after ${Math.round(timeoutMs / 1000)}s`);
}

export async function callFalDirect(endpoint: string, input: Record<string, unknown>): Promise<unknown> {
  if (!config.falKey) {
    throw new Error("FAL_KEY is not configured on the backend");
  }

  const response = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${config.falKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(apiError(data, `FAL request failed: ${response.status}`));
  }
  return data;
}

export async function uploadFalFile(buffer: Buffer, name = "upload.png", contentType = "image/png"): Promise<string> {
  if (!config.falKey) {
    throw new Error("FAL_KEY is not configured on the backend");
  }

  const initResponse = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: {
      Authorization: `Key ${config.falKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ file_name: name, content_type: contentType })
  });
  const init = (await readJson(initResponse)) as { upload_url?: string; file_url?: string };
  if (!initResponse.ok || !init.upload_url || !init.file_url) {
    throw new Error(apiError(init, `FAL upload init failed: ${initResponse.status}`));
  }

  const uploadResponse = await fetch(init.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer as any
  });
  if (!uploadResponse.ok) {
    throw new Error(`FAL upload failed: ${uploadResponse.status}`);
  }

  return init.file_url;
}
