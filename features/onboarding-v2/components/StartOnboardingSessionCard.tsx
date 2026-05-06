"use client";

import { useState } from "react";

type StartSessionPayload = {
  ok?: boolean;
  sessionId?: string;
  message?: string;
  failureKind?: string;
  upstreamStatus?: number;
};

export function StartOnboardingSessionCard() {
  const [status, setStatus] = useState<string>("");

  async function startSession(): Promise<void> {
    setStatus("Starting session...");

    try {
      const response = await fetch("/api/onboarding-v2/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceSystem: "profixiq-onboarding-v2" }),
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as StartSessionPayload) : {};

      if (payload.sessionId) {
        setStatus(`Session created: ${payload.sessionId}`);
        return;
      }

      const detail = payload.failureKind ? `${payload.failureKind}${payload.upstreamStatus ? ` (${payload.upstreamStatus})` : ""}` : "";
      const fallback = `Unable to create session — HTTP ${response.status}${text ? ` — ${text.slice(0, 240)}` : ""}`;
      setStatus(payload.message ? `${payload.message}${detail ? ` — ${detail}` : ""}` : fallback);
    } catch (error) {
      setStatus(error instanceof Error ? `Unable to create session — ${error.message}` : "Unable to create session — unknown client error");
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
      <div className="text-sm font-semibold text-white">Start new onboarding session</div>
      <p className="mt-1 text-xs text-slate-400">Creates an onboarding-v2 session through the secure server proxy.</p>
      <button onClick={startSession} className="mt-3 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400">Start session</button>
      {status ? <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{status}</p> : null}
    </div>
  );
}
