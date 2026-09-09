import { useState } from "react";

const SYSTEMS = [
  { key: "active_directory", label: "Active Directory" },
  { key: "microsoft_365", label: "Microsoft 365" },
  { key: "epic", label: "Epic" },
  { key: "badge_system", label: "Badge System" },
  { key: "clinical_apps", label: "Clinical Apps (Med Dispensing, Revenue Cycle)" },
];

const FIELDS = [
  { name: "full_name", label: "Full name", type: "text", placeholder: "Dana Whitfield" },
  { name: "email", label: "Work email", type: "email", placeholder: "dwhitfield@example.org" },
  { name: "department", label: "Team", type: "text", placeholder: "Cardiology" },
  { name: "job_title", label: "Role", type: "text", placeholder: "Registered Nurse" },
  { name: "start_date", label: "Start date", type: "text", placeholder: "Aug 24 or 2026-08-24" },
  { name: "manager_name", label: "Manager", type: "text", placeholder: "Alex Reyes" },
];

const branch = new URLSearchParams(window.location.search).get("branch");
const withBranch = (path: string) => (branch ? `${path}?branch=${branch}` : path);

export default function App() {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.name, ""])),
  );
  const [systems, setSystems] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setState("saving");
    try {
      const res = await fetch(withBranch("/new-hire-submit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, systems }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Submission failed");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
      setState("idle");
    }
  }

  function reset() {
    setValues(Object.fromEntries(FIELDS.map((f) => [f.name, ""])));
    setSystems([]);
    setState("idle");
  }

  return (
    <div className="min-h-screen bg-stone-100 text-teal-950 font-[system-ui]">
      <title>New hire intake — New Hire Tracker</title>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
      />
      <style>{`
        :root { --serif: "Fraunces", Georgia, serif; --sans: "IBM Plex Sans", system-ui, sans-serif; }
        body { font-family: var(--sans); }
        .serif { font-family: var(--serif); }
        .paper { background-image: radial-gradient(rgba(19,78,74,0.07) 1px, transparent 1px); background-size: 18px 18px; }
      `}</style>

      <div className="paper">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <header className="mb-10 border-b-2 border-teal-950/20 pb-6">
            <p className="text-xs uppercase tracking-[0.32em] text-teal-700">
              IT Helpdesk · Onboarding
            </p>
            <h1 className="serif mt-3 text-5xl leading-none">New hire intake</h1>
            <p className="mt-4 max-w-xl text-sm text-teal-900/70">
              HR completes one form per new starter. Access requests are logged as
              Pending and tracked by the helpdesk until every system is provisioned.
            </p>
          </header>

          {state === "done" ? (
            <div className="rounded-sm border-2 border-teal-950 bg-white p-10 shadow-[6px_6px_0_0_rgba(19,78,74,0.9)]">
              <h2 className="serif text-3xl">Request logged</h2>
              <p className="mt-3 text-sm text-teal-900/75">
                The helpdesk tracker has been updated with a status of In Progress.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={reset}
                  className="rounded-sm bg-teal-950 px-5 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-teal-800"
                >
                  Submit another
                </button>
                <a
                  href={withBranch("/new-hire-tracker")}
                  className="rounded-sm border-2 border-teal-950 px-5 py-2.5 text-sm font-medium transition hover:bg-teal-950 hover:text-stone-50"
                >
                  Open tracker
                </a>
              </div>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="rounded-sm border-2 border-teal-950 bg-white p-8 shadow-[6px_6px_0_0_rgba(19,78,74,0.9)]"
            >
              <div className="grid gap-6 sm:grid-cols-2">
                {FIELDS.map((field) => (
                  <label key={field.name} className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">
                      {field.label}
                    </span>
                    <input
                      required
                      type={field.type}
                      value={values[field.name]}
                      placeholder={field.placeholder}
                      onChange={(e) =>
                        setValues({ ...values, [field.name]: e.target.value })
                      }
                      className="mt-2 w-full border-b-2 border-teal-950/25 bg-transparent px-1 py-2 text-base outline-none transition focus:border-teal-700 placeholder:text-teal-950/30"
                    />
                  </label>
                ))}
              </div>

              <fieldset className="mt-10">
                <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">
                  Systems required
                </legend>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {SYSTEMS.map((system) => {
                    const checked = systems.includes(system.key);
                    return (
                      <label
                        key={system.key}
                        className={`flex cursor-pointer items-center gap-3 border-2 px-4 py-3 text-sm transition ${
                          checked
                            ? "border-teal-950 bg-teal-950 text-stone-50"
                            : "border-teal-950/15 hover:border-teal-950/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSystems(
                              e.target.checked
                                ? [...systems, system.key]
                                : systems.filter((k) => k !== system.key),
                            )
                          }
                          className="size-4 accent-amber-500"
                        />
                        {system.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {error && (
                <p className="mt-6 border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </p>
              )}

              <div className="mt-10 flex items-center justify-between gap-4">
                <a
                  href={withBranch("/new-hire-tracker")}
                  className="text-sm underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
                >
                  View tracker
                </a>
                <button
                  type="submit"
                  disabled={state === "saving"}
                  className="rounded-sm bg-amber-500 px-7 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-teal-950 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  {state === "saving" ? "Submitting…" : "Submit request"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
