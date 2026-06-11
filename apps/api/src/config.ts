import "dotenv/config";
import { execFileSync } from "node:child_process";

export type ProviderMode = "mock" | "live";

function providerMode(): ProviderMode {
  if (process.env.CATALYST_PROVIDER_MODE === "mock") return "mock";
  if (process.env.CATALYST_PROVIDER_MODE === "live") return "live";
  return process.env.FAL_KEY ? "live" : "mock";
}

const selectedProviderMode = providerMode();

function readKeychainSecret(service: string) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

const allowMockOpenRouter = process.env.CATALYST_ALLOW_OPENROUTER_IN_MOCK === "1";
const shouldReadLiveSecrets = selectedProviderMode === "live" || allowMockOpenRouter;
const keychainOpenRouterKey = shouldReadLiveSecrets ? readKeychainSecret("ironwood_openrouter_api_key") : "";

export const config = {
  port: Number(process.env.CATALYST_API_PORT || 5191),
  providerMode: selectedProviderMode,
  falKey: process.env.FAL_KEY || "",
  openRouterKey: shouldReadLiveSecrets ? keychainOpenRouterKey || process.env.OPENROUTER_API_KEY || "" : "",
  openRouterModel: process.env.CATALYST_OPENROUTER_MODEL || "google/gemini-3.5-flash",
  imageToWebsiteAgentModel: process.env.CATALYST_IMAGE_TO_WEBSITE_AGENT_MODEL || "~anthropic/claude-sonnet-latest",
  openRouterReasoning: process.env.CATALYST_OPENROUTER_REASONING || "low",
  dataDir: process.env.CATALYST_DATA_DIR || (selectedProviderMode === "live" ? ".data/live" : ".data/mock")
};

export function assertLiveCredentials() {
  if (config.providerMode === "live" && !config.falKey) {
    throw new Error("CATALYST_PROVIDER_MODE=live requires FAL_KEY");
  }
}
