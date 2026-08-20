import "dotenv/config";
import { execFileSync } from "node:child_process";

export type ProviderMode = "mock" | "live";
export type StoreDriver = "file" | "postgres";
export type AssetStorageDriver = "none" | "r2";
export type LlmProvider = "openrouter" | "fal-openrouter";

function providerMode(): ProviderMode {
  if (process.env.CATALYST_PROVIDER_MODE === "mock") return "mock";
  if (process.env.CATALYST_PROVIDER_MODE === "live") return "live";
  return process.env.FAL_KEY ? "live" : "mock";
}

const selectedProviderMode = providerMode();

function storeDriver(): StoreDriver {
  if (process.env.CATALYST_STORE_DRIVER === "file") return "file";
  if (process.env.CATALYST_STORE_DRIVER === "postgres") return "postgres";
  return process.env.DATABASE_URL ? "postgres" : "file";
}

function assetStorageDriver(): AssetStorageDriver {
  if (process.env.CATALYST_ASSET_STORAGE_DRIVER === "none") return "none";
  if (process.env.CATALYST_ASSET_STORAGE_DRIVER === "r2") return "r2";
  return process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    ? "r2"
    : "none";
}

function llmProvider(): LlmProvider {
  if (process.env.CATALYST_LLM_PROVIDER === "fal-openrouter") return "fal-openrouter";
  if (process.env.CATALYST_LLM_PROVIDER === "openrouter") return "openrouter";
  return process.env.OPENROUTER_API_KEY ? "openrouter" : "fal-openrouter";
}

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
const keychainFalKey = shouldReadLiveSecrets ? readKeychainSecret("ironwood_fal_api_key") : "";

export const config = {
  port: Number(process.env.CATALYST_API_PORT || 5191),
  providerMode: selectedProviderMode,
  storeDriver: storeDriver(),
  databaseUrl: process.env.DATABASE_URL || "",
  maxStoredRuns: Number(process.env.CATALYST_MAX_STORED_RUNS || 250),
  assetStorageDriver: assetStorageDriver(),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || "",
    endpoint: process.env.R2_ENDPOINT || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : ""),
    bucket: process.env.R2_BUCKET || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "")
  },
  falKey: process.env.FAL_KEY || keychainFalKey || "",
  falObjectLifecyclePreference: process.env.FAL_OBJECT_LIFECYCLE_PREFERENCE || "",
  llmProvider: llmProvider(),
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
