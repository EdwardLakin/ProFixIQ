"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onboardingSessionActionPath } from "@/features/onboarding-agent/lib/routes";
import { formatOnboardingSessionStatusLabel } from "@/features/onboarding-agent/lib/sessionStatus";

type SessionRow = {
  id: string;
  title: string | null;
  source: string | null;
  status: string;
  updated_at: string;
  summary?: Record<string, unknown> | null;
  file_count?: number;
};

function asCount(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function OnboardingAgentDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [runningActions, setRunningActions] = useState<Record<string, "rerun" | "delete" | undefined>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | undefined>>({});

  const load = async () => {
    const res = await fetch("/api/onboarding-agent/sessions", { cache: "no-store" });
    const json = await res.json();
    setSessions(json.sessions ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const setSessionAction = (sessionId: string, action: "rerun" | "delete" | null) => {
    setRunningActions((prev) => ({ ...prev, [sessionId]: action ?? undefined }));
  };

  const rerunSession = async (sessionId: string) => {
    setSessionAction(sessionId, "rerun");
    setActionErrors((prev) => ({ ...prev, [sessionId]: undefined }));
    try {
      const res = await fetch(onboardingSessionActionPath(sessionId, "rerun"), { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setActionErrors((prev) => ({ ...prev, [sessionId]: json?.error || "Rerun failed. Please retry." }));
      } else {
        await load();
      }
    } catch {
      setActionErrors((prev) => ({ ...prev, [sessionId]: "Rerun failed. Please retry." }));
    } finally {
      setSessionAction(sessionId, null);
    }
  };

  const deleteSession = async (sessionId: string) => {
    const confirmed = window.confirm(
      "Delete this staged onboarding session? This removes uploaded staged files, analysis rows, staged entities, links, and review items. It does not delete live shop records.",
    );
    if (!confirmed) return;

    setSessionAction(sessionId, "delete");
    setActionErrors((prev) => ({ ...prev, [sessionId]: undefined }));
    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setActionErrors((prev) => ({ ...prev, [sessionId]: json?.error || "Delete failed. Please retry." }));
      } else {
        setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      }
    } catch {
      setActionErrors((prev) => ({ ...prev, [sessionId]: "Delete failed. Please retry." }));
    } finally {
      setSessionAction(sessionId, null);
    }
  };

  const createSession = async () => {
    setBusy(true);
    const res = await fetch("/api/onboarding-agent/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "manual_upload" }),
    });
    const json = await res.json();
    setBusy(false);
    if (json?.sessionId) window.location.href = `/dashboard/onboarding-v2/${json.sessionId}`;
  };

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/60 p-5">
        <h1 className="text-xl font-semibold">Onboarding Agent</h1>
        <p className="mt-2 text-sm text-cyan-100/80">
          Uploaded files are staged as information first. No live customers, vehicles, work orders, invoices, staff, parts, vendors, menu items, or inspections are created until a future activation step.
        </p>
        <button
          onClick={createSession}
          disabled={busy}
          className="mt-4 rounded-md border border-cyan-400/40 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start onboarding session"}
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold">Recent sessions</h2>
        <div className="mt-3 space-y-2">
          {sessions.map((session) => {
            const summary = session.summary ?? {};
            return (
              <div key={session.id} className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{session.title || session.source || "Untitled session"}</p>
                    <p className="text-xs text-slate-400">
                      Status: {formatOnboardingSessionStatusLabel(session.status)} • Last updated {new Date(session.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/onboarding-v2/${session.id}`}
                      className="rounded-md border border-cyan-400/40 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/10"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => rerunSession(session.id)}
                      disabled={Boolean(runningActions[session.id])}
                      className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningActions[session.id] === "rerun" ? "Rerunning…" : "Rerun"}
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      disabled={Boolean(runningActions[session.id])}
                      className="rounded-md border border-rose-400/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningActions[session.id] === "delete" ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-300 sm:grid-cols-3 lg:grid-cols-4">
                  <p>Files: {asCount(session.file_count)}</p>
                  <p>Rows parsed: {asCount(summary.rowsParsedTotal ?? summary.rowsParsed)}</p>
                  <p>Review exceptions: {asCount(summary.reviewExceptions)}</p>
                  <p>Source: {session.source || "manual"}</p>
                </div>
                {actionErrors[session.id] ? <p className="mt-2 text-xs text-rose-300">{actionErrors[session.id]}</p> : null}
              </div>
            );
          })}
          {sessions.length === 0 ? <p className="text-sm text-slate-400">No sessions yet.</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs text-slate-300">
        <p>
          Need diagnostics from the legacy flow? Use{" "}
          <Link href="/dashboard/owner/reports" className="text-cyan-200 underline underline-offset-2">
            Shop Health
          </Link>{" "}
          and{" "}
          <Link href="/dashboard/setup/review" className="text-cyan-200 underline underline-offset-2">
            legacy guided review
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
