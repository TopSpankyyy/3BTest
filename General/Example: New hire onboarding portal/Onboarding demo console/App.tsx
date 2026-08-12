import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./src/lib/store";
import { ToastProvider } from "./src/components/primitives";
import { Header } from "./src/components/Header";
import { DemoControls } from "./src/components/DemoControls";
import { ConnectGuide } from "./src/components/ConnectGuide";
import { ExamplesDialog } from "./src/components/ExamplesDialog";
import { Overview } from "./src/pages/Overview";
import { CaseDetail } from "./src/pages/CaseDetail";
import { Approvals } from "./src/pages/Approvals";
import { Report } from "./src/pages/Report";

function Shell() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--accent)] focus:px-3 focus:py-1.5 focus:text-white">Skip to content</a>
      <Header onOpenDemo={() => setDemoOpen(true)} />
      <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/case/:id" element={<CaseDetail />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/report" element={<Report />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </main>
      <footer className="mx-auto max-w-[1400px] px-4 pb-8 pt-2 text-xs sm:px-6" style={{ color: "var(--text-2)" }}>
        Globex Corporation · Demo environment · All people, systems, events, and responses are synthetic. No external systems are connected.{" "}
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="rounded underline underline-offset-2 transition-soft hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          How to connect your systems to this workflow
        </button>
        {" · "}
        <button
          type="button"
          onClick={() => setExamplesOpen(true)}
          className="rounded underline underline-offset-2 transition-soft hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          Interested in more examples?
        </button>
      </footer>
      <DemoControls open={demoOpen} onClose={() => setDemoOpen(false)} />
      <ConnectGuide open={connectOpen} onClose={() => setConnectOpen(false)} />
      <ExamplesDialog open={examplesOpen} onClose={() => setExamplesOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={(window as any).__ROUTE_PATH__ || undefined}>
      <ToastProvider>
        <AppProvider>
          <Shell />
        </AppProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
