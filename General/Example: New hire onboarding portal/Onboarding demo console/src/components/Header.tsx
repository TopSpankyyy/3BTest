import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useApp, useTheme } from "../lib/store";
import { Button } from "./primitives";
import { fmtDateTime } from "../lib/ui";
import { GlobeMark } from "./GlobeMark";

export function Header({ onOpenDemo }: { onOpenDemo: () => void }) {
  const { clock } = useApp();
  const [theme, toggle] = useTheme();
  const [showInfo, setShowInfo] = useState(false);
  const [localTime, setLocalTime] = useState("");
  useEffect(() => {
    const t = setInterval(() => setLocalTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), 1000);
    setLocalTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    return () => clearInterval(t);
  }, []);

  const nav = [
    { to: "/", label: "Operations", end: true },
    { to: "/approvals", label: "Approvals" },
    { to: "/report", label: "Reporting" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--page) 88%, transparent)" }}>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <GlobeMark size={32} />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Globex Corporation</div>
            <div className="text-[11px]" style={{ color: "var(--text-2)" }}>New Hire Onboarding Portal</div>
          </div>
        </div>

        <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Primary">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="rounded-lg px-3 py-1.5 text-sm font-medium transition-soft"
              style={({ isActive }) => ({ background: isActive ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent", color: isActive ? "var(--accent)" : "var(--text-2)" })}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Demo environment indicator */}
          <div className="relative">
            <button onClick={() => setShowInfo((s) => !s)} onBlur={() => setTimeout(() => setShowInfo(false), 150)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-soft"
              style={{ borderColor: "color-mix(in srgb, var(--warning) 40%, var(--border))", color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 10%, transparent)" }}
              aria-expanded={showInfo} aria-label="About this demo environment">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warning)" }} />
              Demo environment
            </button>
            {showInfo && (
              <div role="tooltip" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border p-3 text-xs shadow-lg" style={{ background: "var(--card-solid)", borderColor: "var(--border)", color: "var(--text-2)" }}>
                All people, systems, events, and responses in this environment are synthetic. No external systems are connected.
              </div>
            )}
          </div>

          {/* Simulated clock — visually distinct from real local time */}
          <div className="hidden items-center gap-2 rounded-lg border px-2.5 py-1 sm:flex" style={{ borderColor: "var(--border)" }} title="Deterministic simulated clock">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Sim</span>
            <span className="text-xs font-medium tnum">{fmtDateTime(clock)}</span>
            <span className="text-[10px] tnum" style={{ color: "var(--text-2)" }}>· local {localTime}</span>
          </div>

          <Button variant="ghost" size="sm" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? "☾" : "☀"}</Button>
          <Button variant="primary" size="sm" onClick={onOpenDemo}>Run demo</Button>
        </div>
      </div>
    </header>
  );
}
