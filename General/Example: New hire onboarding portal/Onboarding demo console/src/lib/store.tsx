import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { read, command, CommandResult } from "./api";
import { useToast } from "../components/primitives";

interface AppState {
  overview: any | null;
  clock: string;
  version: number;
  loading: boolean;
  error: string | null;
  revision: number;
  refresh: () => void;
  run: (type: string, opts?: any, successMsg?: string) => Promise<CommandResult>;
}

const Ctx = createContext<AppState>(null as any);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const toast = useToast();
  // Authoritative store version for optimistic concurrency. Kept in a ref so that
  // rapid sequential commands use the latest version immediately, without waiting
  // for the async overview refetch — otherwise the second command would send a
  // stale expectedVersion and be rejected with 409 STALE_VERSION.
  const versionRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await read("overview");
      setOverview(data);
      versionRef.current = data.version ?? versionRef.current;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, revision]);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const run = useCallback(async (type: string, opts: any = {}, successMsg?: string) => {
    // Omit expectedVersion until the store version is known (0 = unknown).
    const expectedVersion = opts.expectedVersion ?? (versionRef.current || undefined);
    const res = await command(type, { ...opts, expectedVersion });
    if (res.ok) {
      if (typeof res.version === "number") versionRef.current = res.version;
      toast.push(successMsg ?? res.message ?? "Done", "success");
      setRevision((r) => r + 1);
    } else {
      // Recover the true version so a stale-version rejection self-heals on retry.
      if (typeof res.version === "number") versionRef.current = res.version;
      toast.push(res.error ?? "Command failed", "error");
    }
    return res;
  }, [toast]);

  const value: AppState = {
    overview, clock: overview?.clock ?? "2024-06-03T08:00:00.000Z", version: overview?.version ?? 0,
    loading, error, revision, refresh, run,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Generic read hook that refetches when the global revision changes.
export function useRead<T = any>(resource: string, params: Record<string, string | undefined> = {}, deps: any[] = []): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const { revision } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params);
  const reload = useCallback(() => {
    let live = true;
    setLoading(true);
    read<T>(resource, params).then((d) => { if (live) { setData(d); setError(null); } }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [resource, key]);
  useEffect(() => { const cleanup = reload(); return cleanup; }, [reload, revision, ...deps]);
  return { data, loading, error, reload };
}

// Theme hook — persisted, defaults to system.
export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("arc-theme") || "dark");
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("arc-theme", theme); }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
