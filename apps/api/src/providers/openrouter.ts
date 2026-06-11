import { config } from "../config";

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

const mockupPresentationSurfaceTerms = [
  /\bbrowser chrome\b/i,
  /\bbrowser window\b/i,
  /\baddress bar\b/i,
  /\bbrowser tabs?\b/i,
  /\bsafari window\b/i,
  /\bchrome window\b/i,
  /\bdesktop window\b/i,
  /\bos window\b/i,
  /\bwindow controls\b/i,
  /\blaptop\b/i,
  /\bdesktop monitor\b/i,
  /\bcomputer monitor\b/i,
  /\bcomputer screen\b/i,
  /\bphone frame\b/i,
  /\bsmartphone\b/i,
  /\btablet\b/i,
  /\bdevice frame\b/i,
  /\bdisplayed (inside|on|within)\b/i,
  /\bshown (inside|on|within)\b/i,
  /\bpresentation scene\b/i
];

function mentionsMockupPresentationSurface(value: string) {
  return mockupPresentationSurfaceTerms.some((pattern) => pattern.test(value));
}

export function enhancementRules(context: string) {
  if (context.includes("Task: mockup")) {
    return [
      "Catalyst mockup terminology: a website/app mockup is the standalone design itself, not a photograph of a browser, laptop, desktop monitor, phone, tablet, or computer.",
      "Do not add browser chrome, address bars, tabs, scrollbars, OS windows, device frames, hands, desks, monitors, or presentation scenes unless the original prompt explicitly asks for those.",
      "For website prompts, write for an edge-to-edge flat page design or full-page composition."
    ].join("\n");
  }
  if (context.includes("Task: logo")) {
    return "For logo prompts, preserve the logo subject and keep the result on a clean pure-white background unless the original prompt explicitly asks otherwise.";
  }
  return "";
}

export function sanitizeEnhancedPrompt(prompt: string, enhancedPrompt: string, context: string) {
  const original = prompt.trim();
  const enhanced = enhancedPrompt.trim();
  if (!enhanced) return original;

  if (context.includes("Task: mockup") && !mentionsMockupPresentationSurface(original) && mentionsMockupPresentationSurface(enhanced)) {
    return [
      original,
      "Standalone flat page/interface design only; do not depict it inside a browser, laptop, monitor, phone, tablet, OS window, or device frame."
    ]
      .filter(Boolean)
      .join(" ");
  }

  return enhanced;
}

export function hasLlmCredentials() {
  if (config.llmProvider === "fal-openrouter") return Boolean(config.falKey);
  return Boolean(config.openRouterKey);
}

export async function enhancePrompt(prompt: string, context: string): Promise<string> {
  if (!hasLlmCredentials()) return prompt;

  const enhanced = await callOpenRouter(
    [
      {
        role: "system",
        content:
          "Rewrite image-generation prompts for logo and visual design tools. Use the supplied structured context as part of the creative brief, including model settings, aspect ratio, client notes, colors, brand guidance, and attached-reference summaries. Preserve the user's intent exactly. Do not change the object type or presentation surface. Return only the improved prompt, no quotes or commentary."
      },
      {
        role: "user",
        content: `Structured context:\n${context}\n\n${enhancementRules(context)}\n\nOriginal prompt:\n${prompt}`
      }
    ],
    { temperature: 0.1 }
  );

  return sanitizeEnhancedPrompt(prompt, enhanced, context) || prompt;
}

export async function callOpenRouter(
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>,
  options: { json?: boolean; model?: string; temperature?: number; timeoutMs?: number } = {}
): Promise<string> {
  if (!hasLlmCredentials()) {
    throw new Error(
      config.llmProvider === "fal-openrouter"
        ? "FAL_KEY is required for CATALYST_LLM_PROVIDER=fal-openrouter"
        : "OPENROUTER_API_KEY is not configured on the backend"
    );
  }

  const useFalOpenRouter = config.llmProvider === "fal-openrouter";
  const response = await fetch(useFalOpenRouter ? "https://fal.run/openrouter/router/openai/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
    headers: {
      Authorization: useFalOpenRouter ? `Key ${config.falKey}` : `Bearer ${config.openRouterKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ray-catalyst-studio.local",
      "X-Title": "Ray Catalyst Studio"
    },
    body: JSON.stringify({
      model: options.model || config.openRouterModel,
      reasoning: { effort: config.openRouterReasoning },
      ...(typeof options.temperature === "number" ? { temperature: options.temperature } : {}),
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
      messages
    })
  });

  const data = (await readJson(response)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `OpenRouter request failed: ${response.status}`);
  }

  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function callOpenRouterJson<T>(
  messages: Array<{ role: "system" | "user" | "assistant"; content: unknown }>,
  options: { model?: string } = {}
): Promise<T> {
  const raw = await callOpenRouter(messages, { ...options, json: true });
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}
