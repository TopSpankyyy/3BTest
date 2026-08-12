import React from "react";

/**
 * Theme-aware brand mark: a line-art globe drawn in the accent color inside a
 * softly tinted tile. Every color comes from a CSS token, so switching between
 * light and dark themes eases rather than flashing a baked-in background.
 */
export function GlobeMark({ size = 32 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-lg transition-soft"
      style={{
        width: size,
        height: size,
        color: "var(--accent)",
        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        boxShadow: "inset 0 0 0 1px var(--border)",
        transition: "background 200ms ease, box-shadow 200ms ease, color 200ms ease",
      }}
    >
      <svg
        width={Math.round(size * 0.625)}
        height={Math.round(size * 0.625)}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        <circle cx="10" cy="10" r="8" />
        <path d="M2 10h16" opacity="0.75" />
        <path d="M10 2c3 2.2 3 13.6 0 16" opacity="0.55" />
        <path d="M10 2c-3 2.2-3 13.6 0 16" opacity="0.55" />
        <path d="M3.7 5.4a13 13 0 0 0 12.6 0M3.7 14.6a13 13 0 0 1 12.6 0" opacity="0.4" />
      </svg>
    </div>
  );
}
