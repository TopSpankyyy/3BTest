import { useCallback, useEffect, useRef, useState } from "react";

type System = { key: string; label: string };
type Hire = Record<string, string | number | null>;

const SYSTEM_STATUSES = ["Pending", "In Progress", "Done"] as const;
const OVERALL = ["Requested", "In Progress", "Complete"] as const;

const branch = new URLSearchParams(window.location.search).get("branch");
const withBranch = (path: string) => (branch ? `${path}?branch=${branch}` : path);

const systemStyles: Record<string, string> = {
  Pending: "border-teal-950/20 bg-stone-100 text-teal-900",
  "In Progress": "border-amber-500 bg-amber-100 text-amber-900",
  Done: "border-emerald-700 bg-emerald-700 text-stone-50",
  Blocked: "border-red-700 bg-red-700 text-stone-50",
};

const overallStyles: Record<string, string> = {
  Requested: "bg-stone-200 text-teal-900",
  "In Progress": "bg-amber-500 text-teal-950",
  Complete: "bg-emerald-700 text-stone-50",
};

const DAY = 86_400_000;

// Provisioning is expected to start one week before the hire's start date.
function expectedInProgress(startDate: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate ?? "").trim());
  if (!match) return "Expected to move to In Progress one week before the start date.";

  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const expected = start - 7 * DAY;
  const label = new Date(expected).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((expected - today) / DAY);
  const when =
    days > 1
      ? `in ${days} days`
      : days === 1
        ? "tomorrow"
        : days === 0
          ? "today"
          : days === -1
            ? "1 day overdue"
            : `${-days} days overdue`;

  return `Expected to move to In Progress on ${label} (${when}) — one week before the ${new Date(start).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })} start date.`;
}

// Auto provision records the failure reason for each blocked service as a JSON map.
function blockedError(hire: Hire, systemKey: string): string | null {
  try {
    const notes = JSON.parse(String(hire.blocked_notes ?? "") || "{}");
    const message = notes?.[systemKey];
    return typeof message === "string" && message ? message : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [systems, setSystems] = useState<System[]>([]);
  const [hires, setHires] = useState<Hire[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);
  // The table scrolls horizontally, which would clip an in-cell tooltip, so the
  // hover note is rendered once in a fixed layer positioned from the button's rect.
  const [tip, setTip] = useState<{
    text: string;
    blocked: boolean;
    x: number;
    y: number;
    below: boolean;
  } | null>(null);

  useEffect(() => {
    const clear = () => setTip(null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);

  function showTip(
    element: HTMLElement,
    text: string,
    blocked: boolean,
  ) {
    const rect = element.getBoundingClientRect();
    // Flip below the button when there is not enough room above it, and keep the
    // 224px-wide tooltip inside the viewport horizontally.
    const below = rect.top < 150;
    const half = 116;
    const centre = rect.left + rect.width / 2;
    setTip({
      text,
      blocked,
      x: Math.min(Math.max(centre, half), window.innerWidth - half),
      y: below ? rect.bottom + 8 : rect.top - 8,
      below,
    });
  }

  const load = useCallback(async () => {
    const res = await fetch(withBranch("/new-hire-list"));
    if (!res.ok) throw new Error("Could not load new hires");
    const data = await res.json();
    setSystems(data.systems);
    setHires(data.hires);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (busyRef.current) return;
      load().catch((err) => {
        if (!cancelled) setError(err.message);
      });
    };
    tick();
    // Auto provision advances services in the background, so keep the grid live.
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  async function cycle(hire: Hire, systemKey: string) {
    const current = String(hire[systemKey]);
    // A blocked service is cleared by resolving it to Done.
    const next =
      current === "Blocked"
        ? "Done"
        : SYSTEM_STATUSES[
            (SYSTEM_STATUSES.indexOf(current as never) + 1) % SYSTEM_STATUSES.length
          ];
    const token = `${hire.id}:${systemKey}`;
    busyRef.current = token;
    setBusy(token);
    setError(null);
    try {
      const res = await fetch(withBranch("/new-hire-system-status"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hire.id, system: systemKey, status: next }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Update failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }

  const counts = Object.fromEntries(
    OVERALL.map((s) => [s, (hires ?? []).filter((h) => h.status === s).length]),
  );

  return (
    <div className="min-h-screen bg-stone-100 text-teal-950">
      <title>New Hire Tracker — IT Helpdesk</title>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
      />
      <style>{`
        body { font-family: "IBM Plex Sans", system-ui, sans-serif; }
        .serif { font-family: "Fraunces", Georgia, serif; }
      `}</style>

      <div className="mx-auto max-w-7xl px-6 py-12">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-teal-950/20 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-teal-700">
              IT Helpdesk · Provisioning
            </p>
            <h1 className="serif mt-3 text-5xl leading-none">New Hire Tracker</h1>
          </div>
          <a
            href={withBranch("/new-hire-form")}
            className="rounded-sm border-2 border-teal-950 px-5 py-2.5 text-sm font-medium transition hover:bg-teal-950 hover:text-stone-50"
          >
            New intake form
          </a>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {OVERALL.map((label) => (
            <div
              key={label}
              className="border-2 border-teal-950 bg-white px-6 py-5 shadow-[4px_4px_0_0_rgba(19,78,74,0.9)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                {label}
              </p>
              <p className="serif mt-2 text-4xl leading-none">{counts[label] ?? 0}</p>
            </div>
          ))}
        </section>

        {error && (
          <p className="mt-6 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-8 overflow-x-auto border-2 border-teal-950 bg-white shadow-[6px_6px_0_0_rgba(19,78,74,0.9)]">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="bg-teal-950 text-stone-50">
                <th className="px-4 py-3 text-left font-semibold">New hire</th>
                <th className="px-4 py-3 text-left font-semibold">Department / title</th>
                <th className="px-4 py-3 text-left font-semibold">Start</th>
                <th className="px-4 py-3 text-left font-semibold">Manager</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                {systems.map((s) => (
                  <th key={s.key} className="px-3 py-3 text-left font-semibold">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hires === null && (
                <tr>
                  <td colSpan={5 + systems.length} className="px-4 py-10 text-center text-teal-900/60">
                    Loading…
                  </td>
                </tr>
              )}
              {hires?.length === 0 && (
                <tr>
                  <td colSpan={5 + systems.length} className="px-4 py-10 text-center text-teal-900/60">
                    No new hires yet. Submit the intake form to get started.
                  </td>
                </tr>
              )}
              {hires?.map((hire) => (
                <tr key={String(hire.id)} className="border-t border-teal-950/10 align-middle">
                  <td className="px-4 py-3">
                    <div className="font-medium">{String(hire.full_name)}</div>
                    <div className="text-xs text-teal-900/60">{String(hire.email)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{String(hire.department)}</div>
                    <div className="text-xs text-teal-900/60">{String(hire.job_title)}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{String(hire.start_date)}</td>
                  <td className="px-4 py-3">{String(hire.manager_name)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-sm px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        overallStyles[String(hire.status)] ?? "bg-stone-200"
                      }`}
                    >
                      {String(hire.status)}
                    </span>
                  </td>
                  {systems.map((system) => {
                    const value = hire[system.key];
                    const token = `${hire.id}:${system.key}`;
                    if (value === null) {
                      return (
                        <td key={system.key} className="px-3 py-3 text-center text-teal-950/25">
                          —
                        </td>
                      );
                    }
                    const isBlocked = String(value) === "Blocked";
                    const note = isBlocked
                      ? (blockedError(hire, system.key) ?? "Provisioning failed.")
                      : String(value) === "Pending"
                        ? expectedInProgress(hire.start_date)
                        : null;
                    return (
                      <td key={system.key} className="px-3 py-3">
                        <button
                          onClick={() => cycle(hire, system.key)}
                          disabled={busy === token}
                          title={note ? undefined : "Click to advance status"}
                          onMouseEnter={
                            note ? (e) => showTip(e.currentTarget, note, isBlocked) : undefined
                          }
                          onFocus={
                            note ? (e) => showTip(e.currentTarget, note, isBlocked) : undefined
                          }
                          onMouseLeave={note ? () => setTip(null) : undefined}
                          onBlur={note ? () => setTip(null) : undefined}
                          className={`w-28 border-2 px-2 py-1.5 text-xs font-semibold transition hover:-translate-y-px disabled:opacity-50 ${
                            systemStyles[String(value)]
                          }`}
                        >
                          {busy === token ? "…" : String(value)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-teal-900/60">
          Click a system status to cycle it: Pending → In Progress → Done. A Blocked
          service shows its failure reason on hover and goes straight to Done when
          clicked. The overall status only becomes Complete once every requested system
          is Done.
        </p>
      </div>

      {tip && (
        <div
          role="tooltip"
          style={{
            left: `${tip.x}px`,
            top: `${tip.y}px`,
            transform: tip.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
          }}
          className={`pointer-events-none fixed z-50 w-56 border-2 px-3 py-2 text-left text-xs leading-snug font-normal text-stone-50 shadow-[3px_3px_0_0_rgba(19,78,74,0.35)] ${
            tip.blocked ? "border-red-900 bg-red-800" : "border-teal-950 bg-teal-950"
          }`}
        >
          {tip.blocked && (
            <span className="mb-1 block font-semibold uppercase tracking-wide">
              Provisioning failed
            </span>
          )}
          {tip.text}
          {tip.blocked && (
            <span className="mt-1 block text-red-100/80">
              Click to mark it Done once resolved.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
