"use client";

import { useState } from "react";

export function StartOnboardingSessionCard() {
  const [status, setStatus] = useState<string>("");

  async function startSession(): Promise<void> {
    setStatus("Starting session...");
    const response = await fetch("/api/onboarding-v2/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceSystem: "profixiq-onboarding-v2" }),
    });
    const payload = (await response.json()) as { sessionId?: string; message?: string };
    setStatus(payload.sessionId ? `Session created: ${payload.sessionId}` : payload.message ?? "Unable to create session");
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
      <div className="text-sm font-semibold text-white">Start new onboarding session</div>
      <p className="mt-1 text-xs text-slate-400">Creates an onboarding-v2 session through the secure server proxy.</p>
      <button onClick={startSession} className="mt-3 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400">Start session</button>
      {status ? <p className="mt-2 text-xs text-slate-300">{status}</p> : null}
    </div>
  );
}
