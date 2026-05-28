import "dotenv/config";

export type ProviderMode = "mock" | "live";

function providerMode(): ProviderMode {
  if (process.env.CATALYST_PROVIDER_MODE === "mock") return "mock";
  if (process.env.CATALYST_PROVIDER_MODE === "live") return "live";
  return process.env.FAL_KEY ? "live" : "mock";
}

export const config = {
  port: Number(process.env.CATALYST_API_PORT || 5191),
  providerMode: providerMode(),
  falKey: process.env.FAL_KEY || "",
  dataDir: process.env.CATALYST_DATA_DIR || ".data"
};

export function assertLiveCredentials() {
  if (config.providerMode === "live" && !config.falKey) {
    throw new Error("CATALYST_PROVIDER_MODE=live requires FAL_KEY");
  }
}
