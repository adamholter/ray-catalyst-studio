import "dotenv/config";

export type ProviderMode = "mock" | "live";

export const config = {
  port: Number(process.env.CATALYST_API_PORT || 5191),
  providerMode: (process.env.CATALYST_PROVIDER_MODE === "live" ? "live" : "mock") as ProviderMode,
  falKey: process.env.FAL_KEY || "",
  dataDir: process.env.CATALYST_DATA_DIR || ".data"
};

export function assertLiveCredentials() {
  if (config.providerMode === "live" && !config.falKey) {
    throw new Error("CATALYST_PROVIDER_MODE=live requires FAL_KEY");
  }
}
