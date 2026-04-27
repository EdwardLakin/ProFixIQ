"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SessionRow = { id: string; title: string | null; status: string; created_at: string; summary?: Record<string, unknown> | null };

export function OnboardingAgentDashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/onboarding-agent/sessions", { cache: "no-store" });
    const json = await res.json();
    setSessions(json.sessions ?? []);
  };

  useEffect(() => { void load(); }, []);

  const createSession = async () => {
    setBusy(true);
    const res = await fetch("/api/onboarding-agent/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "manual_upload" }) });
    const json = await res.json();
    setBusy(false);
    if (json?.sessionId) window.location.href = `/dashboard/onboarding/${json.sessionId}`;
  };

  return (
    <div className="space-y-4 p-6 text-white">
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/60 p-5">
        <h1 className="text-xl font-semibold">Onboarding Agent</h1>
        <p className="mt-2 text-sm text-cyan-100/80">Uploaded files are staged as information first. No live customers, vehicles, work orders, invoices, staff, parts, vendors, menu items, or inspections are created until a future activation step.</p>
        <p className="mt-2 text-xs text-slate-300">
          Use this workspace to create sessions and register staged storage paths now. In-app direct file upload and expanded import intelligence are next.
        </p>
        <button onClick={createSession} disabled={busy} className="mt-4 rounded-md border border-cyan-400/40 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-50">{busy ? "Creating…" : "Create onboarding session"}</button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold">Recent sessions</h2>
        <div className="mt-3 space-y-2">
          {sessions.map((session) => (
            <Link key={session.id} href={`/dashboard/onboarding/${session.id}`} className="block rounded-lg border border-white/10 bg-slate-900/50 p-3 hover:border-cyan-400/40">
              <p>{session.title || "Untitled session"}</p>
              <p className="text-xs text-slate-400">{session.status} • {new Date(session.created_at).toLocaleString()}</p>
            </Link>
          ))}
          {sessions.length === 0 ? <p className="text-sm text-slate-400">No sessions yet.</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-xs text-slate-300">
        <p>
          Need diagnostics from the legacy flow? Use <Link href="/dashboard/owner/reports" className="text-cyan-200 underline underline-offset-2">Shop Health</Link> and{" "}
          <Link href="/dashboard/setup/review" className="text-cyan-200 underline underline-offset-2">legacy guided review</Link>.
        </p>
      </div>
    </div>
  );
}
