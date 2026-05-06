"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StartSessionPayload = {
  ok?: boolean;
  sessionId?: string;
  message?: string;
  failureKind?: string;
  upstreamStatus?: number;
};

export function StartOnboardingSessionCard() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function startSession(): Promise<void> {
    if (loading) return;

    setLoading(true);
    setStatus("Starting onboarding session...");

    try {
      const response = await fetch("/api/onboarding-v2/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceSystem: "profixiq-onboarding-v2" }),
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as StartSessionPayload) : {};

      if (payload.sessionId) {
        setStatus("Session created. Opening workspace...");
        router.push(`/dashboard/onboarding-v2/${payload.sessionId}`);
        router.refresh();
        return;
      }

      const detail = payload.failureKind
        ? `${payload.failureKind}${payload.upstreamStatus ? ` (${payload.upstreamStatus})` : ""}`
        : "";

      setStatus(
        payload.message
          ? `${payload.message}${detail ? ` — ${detail}` : ""}`
          : `Unable to create session${payload.upstreamStatus ? ` (${payload.upstreamStatus})` : ""}`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? `Unable to create session — ${error.message}`
          : "Unable to create session",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
      <div className="text-sm font-semibold text-white">
        Start new onboarding session
      </div>

      <p className="mt-1 text-xs text-slate-400">
        Creates an onboarding-v2 session through the secure server proxy.
      </p>

      <button
        onClick={startSession}
        disabled={loading}
        className="mt-3 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Starting..." : "Start session"}
      </button>

      {status ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">
          {status}
        </p>
      ) : null}
    </div>
  );
}
