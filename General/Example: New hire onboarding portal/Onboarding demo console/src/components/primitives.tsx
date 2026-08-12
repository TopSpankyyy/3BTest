import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toneVar } from "../lib/ui";

type Tone = "success" | "warning" | "error" | "info" | "neutral" | "accent";

export function Card({ children, className = "", as: As = "div", ...rest }: any) {
  return (
    <As className={`rounded-[10px] border transition-soft ${className}`} style={{ background: "var(--card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }} {...rest}>
      {children}
    </As>
  );
}

export function Badge({ label, tone = "neutral", subtle = true }: { label: string; tone?: Tone; subtle?: boolean }) {
  const c = toneVar(tone);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tnum" style={{ color: subtle ? c : "#fff", background: subtle ? `color-mix(in srgb, ${c} 14%, transparent)` : c, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  );
}

export function Button({ children, variant = "secondary", size = "md", className = "", ...rest }: any) {
  const base = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-soft disabled:opacity-50 disabled:cursor-not-allowed select-none";
  const sizes: Record<string, string> = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-3.5 py-2", lg: "text-sm px-4 py-2.5" };
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "#fff" },
    secondary: { background: "transparent", color: "var(--text)", border: "1px solid var(--border)" },
    danger: { background: "color-mix(in srgb, var(--error) 12%, transparent)", color: "var(--error)", border: "1px solid color-mix(in srgb, var(--error) 30%, transparent)" },
    ghost: { background: "transparent", color: "var(--text-2)" },
  };
  return (
    <button className={`${base} ${sizes[size]} ${variant === "primary" ? "hover:brightness-105" : "hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"} ${className}`} style={styles[variant]} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }} role="status">
      <span className="inline-block h-4 w-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      {label}…
    </div>
  );
}

export function EmptyState({ title, hint, icon = "○" }: { title: string; hint?: string; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      <div aria-hidden className="mb-1 text-2xl" style={{ color: "var(--text-2)" }}>{icon}</div>
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs max-w-xs" style={{ color: "var(--text-2)" }}>{hint}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="p-6 text-center">
      <div aria-hidden className="mb-1 text-xl" style={{ color: "var(--error)" }}>!</div>
      <div className="text-sm font-medium">Something went wrong</div>
      <div className="text-xs mb-3" style={{ color: "var(--text-2)" }}>{message}</div>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </Card>
  );
}

// Progress ring for readiness score.
export function Ring({ value, size = 52, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 100 ? "var(--success)" : value >= 60 ? "var(--accent)" : value >= 30 ? "var(--warning)" : "var(--error)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <span className="absolute text-xs font-semibold tnum">{value}</span>
      {label && <span className="sr-only">{label}: {value} of 100</span>}
    </div>
  );
}

// Modal + Drawer with focus trap-lite and Escape close.
export function Overlay({ open, onClose, children, side }: { open: boolean; onClose: () => void; children: React.ReactNode; side?: "right" | "center" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  const center = side !== "right";
  return (
    <div className="fixed inset-0 z-50 flex" style={{ background: "color-mix(in srgb, var(--text) 32%, transparent)", justifyContent: center ? "center" : "flex-end", alignItems: center ? "center" : "stretch" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={center ? "m-4 w-full max-w-lg animate-in fade-in zoom-in-95 duration-150" : "h-full w-full max-w-xl animate-in slide-in-from-right duration-200"} style={{ outline: "none" }}>
        <Card className={`${center ? "" : "h-full rounded-none rounded-l-[10px]"} overflow-hidden`} style={{ background: "var(--card-solid)", boxShadow: "var(--shadow)", maxHeight: center ? "90vh" : "100%", display: "flex", flexDirection: "column" }}>
          {children}
        </Card>
      </div>
    </div>
  );
}

// Toast context.
type Toast = { id: number; message: string; tone: Tone };
const ToastCtx = createContext<{ push: (m: string, t?: Tone) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = "neutral") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-lg border px-3.5 py-2.5 text-sm shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200 max-w-sm" style={{ background: "var(--card-solid)", borderColor: `color-mix(in srgb, ${toneVar(t.tone)} 40%, var(--border))`, color: "var(--text)" }}>
            <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: toneVar(t.tone) }} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-2)" }}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-2)" }}>{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent transition-soft";
export const inputStyle: React.CSSProperties = { background: "var(--page)", borderColor: "var(--border)", color: "var(--text)" };

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold tnum" style={{ color: tone ?? "var(--text)" }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{sub}</div>}
    </Card>
  );
}
