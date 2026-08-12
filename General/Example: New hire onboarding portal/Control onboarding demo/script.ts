// "Control onboarding demo" — accepts validated commands from the UI and applies
// them through the authoritative writer. Exclusive writable state volume.
import { parseRequest, json } from "./http";
import { loadState, saveState, resetState } from "./engine/store";
import { applyCommand, Command, CommandResult } from "./engine/commands";

// Map a command result to an HTTP status. A switch keeps the branches flat and
// easy to extend rather than a nested ternary chain.
function httpStatusFor(result: CommandResult): number {
  if (result.ok) return 200;
  switch (result.code) {
    case "NOT_FOUND":
      return 404;
    case "STALE_VERSION":
      return 409;
    case "CONFIRMATION_REQUIRED":
    case "VALIDATION_FAILED":
      return 422;
    default:
      return 400;
  }
}

const req = await parseRequest();

if (req.method !== "POST") {
  process.stdout.write(json(405, { ok: false, error: "Use POST" }));
  process.exit(0);
}

let cmd: Command;
try {
  cmd = JSON.parse(req.body || "{}");
} catch {
  process.stdout.write(json(400, { ok: false, error: "Malformed JSON body", code: "BAD_REQUEST" }));
  process.exit(0);
}

try {
  // RESET_DEMO rebuilds the whole store; handled separately from applyCommand.
  if (cmd.commandType === "RESET_DEMO") {
    if (cmd.payload?.confirm !== "RESET") {
      process.stdout.write(json(422, { ok: false, error: 'Confirmation required: send payload.confirm === "RESET"', code: "CONFIRMATION_REQUIRED" }));
      process.exit(0);
    }
    const fresh = await resetState();
    process.stdout.write(json(200, { ok: true, message: "Demo reset to seed.", version: fresh.version, clock: fresh.clock }));
    process.exit(0);
  }

  const state = await loadState();
  const result = applyCommand(state, cmd);
  // Persist only when a mutation occurred (ok) — read-only rejects don’t write.
  if (result.ok || state.processedCommands[cmd.commandId]) {
    await saveState(state);
  }
  process.stdout.write(json(httpStatusFor(result), result));
} catch (e) {
  // Never leak internals to the client; log server-side.
  console.error("Command failure:", e);
  process.stdout.write(json(500, { ok: false, error: "Internal error processing command", code: "INTERNAL" }));
}
