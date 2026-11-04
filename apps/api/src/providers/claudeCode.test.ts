import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { findClaudeBinary, friendlyClaudeError, parseClaudeOutput, schemaArgument } from "./claudeCode";

function executable(dir: string, name = "claude") {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o755);
  return file;
}

test("finds Claude Code on PATH first, then in usual install locations", () => {
  const home = mkdtempSync(path.join(tmpdir(), "claude-home-"));
  assert.equal(findClaudeBinary({ PATH: "" }, home, []), null);
  const local = executable(path.join(home, ".local", "bin"));
  assert.equal(findClaudeBinary({ PATH: "" }, home, []), local);
  const onPath = executable(path.join(home, "custom"));
  assert.equal(findClaudeBinary({ PATH: path.dirname(onPath) }, home, []), onPath);
});

test("finds the newest Claude Code bundled with the desktop app", () => {
  const home = mkdtempSync(path.join(tmpdir(), "claude-home-"));
  const root = path.join(home, "Library", "Application Support", "Claude", "claude-code");
  executable(path.join(root, "2.1.9"));
  const newest = executable(path.join(root, "2.1.10"));
  assert.equal(findClaudeBinary({ PATH: "" }, home, []), newest);
});

test("reads the model and structured output from Claude Code events", () => {
  const stdout = [
    "notice that is not json",
    JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet-5-5" }),
    JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: { html: "<p>x</p>" }, total_cost_usd: 0.01 })
  ].join("\n");
  assert.deepEqual(parseClaudeOutput(stdout), { ok: true, data: { html: "<p>x</p>" }, model: "claude-sonnet-5-5", costUsd: 0.01 });
});

test("failed runs surface as errors, including a success without structured output", () => {
  const failed = parseClaudeOutput(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" }));
  assert.deepEqual(failed, { ok: false, detail: "Not logged in · Please run /login" });
  assert.equal(parseClaudeOutput(JSON.stringify({ type: "result", subtype: "success", is_error: false })).ok, false);
  assert.equal(parseClaudeOutput("").ok, false);
});

test("common failures become plain-language messages", () => {
  assert.match(friendlyClaudeError("Not logged in · Please run /login"), /not signed in/);
  assert.match(friendlyClaudeError("You've hit your session limit · resets 3pm"), /usage limit reached.*resets 3pm/);
  assert.match(friendlyClaudeError("error: unknown option '--effort'"), /needs an update/);
  assert.match(friendlyClaudeError("Something odd"), /could not finish.*Something odd/);
});

test("schema argument omits the $schema marker Claude Code rejects", () => {
  assert.deepEqual(JSON.parse(schemaArgument({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" })), { type: "object" });
});
