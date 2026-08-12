// Deterministic simulated clock and id helpers.
// The clock never reads real wall-time except as a monotonic tiebreaker in logs;
// all business timestamps derive from state.clock so reset always reproduces the same data.

export const SEED_CLOCK = "2024-06-03T08:00:00.000Z"; // Monday, fixed demo "now"
export const SEED_VERSION = "seed-2024-06-03.v1";
export const POLICY_VERSION = "onboarding-policy-2024.2";

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}
export function addDays(iso: string, days: number): string {
  return addHours(iso, days * 24);
}
export function diffHours(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600_000;
}
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

// ISO week cohort label, e.g. "2024-W23".
export function cohort(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((thursday.getTime() - firstThursday.getTime()) / 86400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Small deterministic PRNG (mulberry32) seeded by a string. Used only for
// procedural historical data — never for the six showcase cases.
export function makeRng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// Deterministic, human-readable ids. Counters live in the builder, not globals.
export function makeIdFactory() {
  const counters: Record<string, number> = {};
  return (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${String(counters[prefix]).padStart(4, "0")}`;
  };
}
