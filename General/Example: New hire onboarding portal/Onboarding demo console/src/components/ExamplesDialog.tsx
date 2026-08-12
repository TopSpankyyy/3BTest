import React from "react";
import { Overlay, Button } from "./primitives";

export function ExamplesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose}>
      <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>More examples</h2>
      </div>
      <div className="px-5 py-4 text-sm" style={{ color: "var(--text-2)" }}>
        For more examples like this one, visit our{" "}
        <a
          href="http://tines.com/3b/examples/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
          style={{ color: "var(--accent)" }}
        >
          Examples Gallery
        </a>{" "}
        at tines.com.
      </div>
      <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Overlay>
  );
}
