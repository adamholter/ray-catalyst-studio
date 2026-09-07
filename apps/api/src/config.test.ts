import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import test from "node:test";

function readConfig(overrides: Record<string, string> = {}, cwd = tmpdir()) {
  const source = `import { config, assertLiveCredentials } from ${JSON.stringify(new URL("./config.ts", import.meta.url).href)};
    let error = "";
    try { assertLiveCredentials(); } catch (cause) { error = cause.message; }
    console.log(JSON.stringify({ mode: config.providerMode, port: config.port, host: config.host, fal: config.falKey,
      openRouter: config.openRouterKey, llm: config.llmProvider, error }));`;
  return JSON.parse(execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", source], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      FAL_KEY: "",
      OPENROUTER_API_KEY: "",
      PORT: "",
      NODE_ENV: "test",
      CATALYST_API_HOST: "",
      CATALYST_API_PORT: "",
      CATALYST_PROVIDER_MODE: "",
      CATALYST_LLM_PROVIDER: "",
      CATALYST_ALLOW_OPENROUTER_IN_MOCK: "",
      ...overrides
    }
  }));
}

test("missing credentials fail live requests rather than silently selecting mock or Keychain credentials", () => {
  const result = readConfig();
  assert.equal(result.mode, "live");
  assert.equal(result.fal, "");
  assert.equal(result.openRouter, "");
  assert.match(result.error, /requires FAL_KEY/);
});

test("explicit provider keys work from a different working directory", () => {
  const result = readConfig({ FAL_KEY: "test-fal", OPENROUTER_API_KEY: "test-router" });
  assert.equal(result.fal, "test-fal");
  assert.equal(result.openRouter, "test-router");
  assert.equal(result.llm, "openrouter");
});

test("mock tests cannot accidentally use project provider credentials", () => {
  const result = readConfig({ CATALYST_PROVIDER_MODE: "mock", FAL_KEY: "test-fal", OPENROUTER_API_KEY: "test-router" });
  assert.equal(result.fal, "");
  assert.equal(result.openRouter, "");
  assert.equal(result.mode, "mock");
});

test("an explicit mock LLM integration test can opt in to fal passthrough", () => {
  assert.equal(readConfig({ CATALYST_PROVIDER_MODE: "mock", CATALYST_ALLOW_OPENROUTER_IN_MOCK: "1", FAL_KEY: "test-fal" }).fal, "test-fal");
});

test("host PORT takes precedence over a local port", () => {
  assert.equal(readConfig({ PORT: "8080", CATALYST_API_PORT: "5191" }).port, 8080);
  assert.equal(readConfig({ CATALYST_API_PORT: "5191" }).port, 5191);
});

test("local development does not expose the unauthenticated API to the network", () => {
  assert.equal(readConfig().host, "127.0.0.1");
  assert.equal(readConfig({ PORT: "8080" }).host, "0.0.0.0");
  assert.equal(readConfig({ CATALYST_API_HOST: "127.0.0.2" }).host, "127.0.0.2");
});
