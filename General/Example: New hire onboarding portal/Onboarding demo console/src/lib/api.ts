// API client for the read + command routes. Auth is the space session cookie
// (same-origin). On a draft branch we append ?branch=<id> so preview fetches
// resolve to the same draft.
const BRANCH: string = (window as any).__BRANCH_ID__ ?? "";
const READ = "/onboarding-read";
const COMMAND = "/onboarding-command";

function withBranch(url: string): string {
  if (!BRANCH) return url;
  return url + (url.includes("?") ? "&" : "?") + "branch=" + encodeURIComponent(BRANCH);
}

export async function read<T = any>(resource: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams({ resource });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, v);
  const res = await fetch(withBranch(`${READ}?${qs.toString()}`), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Read failed (${res.status})`);
  return res.json();
}

export function exportUrl(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams({ resource: "export" });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, v);
  return withBranch(`${READ}?${qs.toString()}`);
}

export interface CommandResult {
  ok: boolean;
  message?: string;
  error?: string;
  code?: string;
  data?: Record<string, any>;
  version?: number;
}

let seq = 0;
export async function command(commandType: string, opts: { caseId?: string; actor?: string; expectedVersion?: number; payload?: Record<string, any> } = {}): Promise<CommandResult> {
  const commandId = `ui-${Date.now()}-${seq++}`;
  const body = { commandId, commandType, requestedAt: new Date().toISOString(), actor: opts.actor ?? "IT Ops (demo user)", caseId: opts.caseId, expectedVersion: opts.expectedVersion, payload: opts.payload ?? {} };
  try {
    const res = await fetch(withBranch(COMMAND), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({ ok: false, error: "Invalid response" }));
    return json as CommandResult;
  } catch {
    return { ok: false, error: "Network error — could not reach the workflow." };
  }
}
