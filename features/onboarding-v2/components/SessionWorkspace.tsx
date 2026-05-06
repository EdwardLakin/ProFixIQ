"use client";

import React from "react";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgentReadinessBanner } from "@/features/onboarding-v2/components/AgentReadinessBanner";
import { ConfirmActivationPanel } from "@/features/onboarding-v2/components/ConfirmActivationPanel";
import { defaultAgentReadiness, normalizeAgentReadiness, type AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

type JsonMap = Record<string, unknown>;
type ApiListResponse = { items?: JsonMap[]; message?: string };

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  return (await r.json()) as T;
}

export function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<JsonMap | null>(null);
  const [events, setEvents] = useState<JsonMap[]>([]);
  const [summary, setSummary] = useState<JsonMap | null>(null);
  const [files, setFiles] = useState<JsonMap[]>([]);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<AgentReadiness>(defaultAgentReadiness());
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [readinessError, setReadinessError] = useState("");

  const terminal = ["completed", "failed", "cancelled"].includes(String(session?.status ?? ""));

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [s, e, a, f, r] = await Promise.all([
          getJson<JsonMap>(`/api/onboarding-v2/sessions/${sessionId}`),
          getJson<ApiListResponse>(`/api/onboarding-v2/sessions/${sessionId}/events?limit=50`),
          getJson<JsonMap>(`/api/onboarding-v2/sessions/${sessionId}/activation-summary`),
          getJson<ApiListResponse>(`/api/onboarding-v2/sessions/${sessionId}/files`),
          getJson<unknown>(`/api/onboarding-v2/agent-readiness`),
        ]);
        if (!active) return;
        setSession(s);
        setEvents(e.items ?? []);
        setSummary(a);
        setFiles(f.items ?? []);
        setReadiness(normalizeAgentReadiness(r));
        setError("");
        setReadinessError("");
      } catch (fetchError) {
        if (!active) return;
        const message = fetchError instanceof Error ? fetchError.message : "";
        setError("Unable to load onboarding session data.");
        setReadiness(defaultAgentReadiness());
        setReadinessError(message ? "Readiness check unavailable. Verify-only safe mode remains enforced." : "");
      } finally {
        if (active) {
          setLoading(false);
          setReadinessLoading(false);
        }
      }
    };
    void run();
    const id = setInterval(() => void run(), terminal ? 15000 : 7000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [sessionId, terminal]);

  const metrics = useMemo(
    () => ({
      entities: Number(summary?.entityCount ?? 0),
      links: Number(summary?.linkCount ?? 0),
      review: Number(summary?.reviewCount ?? 0),
      staged: Number(summary?.stagedCount ?? 0),
    }),
    [summary],
  );

  const triggerAnalyze = async () => {
    await fetch(`/api/onboarding-v2/sessions/${sessionId}/analyze`, { method: "POST" });
  };

  if (loading) return <div className="rounded-xl border border-white/10 p-4">Loading session…</div>;
  if (error) return <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4">{error}</div>;

  return (
    <div className="space-y-4 text-sm text-slate-200">
      <AgentReadinessBanner readiness={readiness} loading={readinessLoading} degradedMessage={readinessError} />
      <div className="rounded-xl border border-white/10 p-4">Session <b>{sessionId}</b> • Status: {String(session?.status ?? "unknown")}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <UploadCard sessionId={sessionId} />
        <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Analyze</div><button onClick={triggerAnalyze} className="mt-3 rounded bg-cyan-600 px-3 py-2">Start processing</button></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">{Object.entries(metrics).map(([k, v]) => <div key={k} className="rounded-xl border border-white/10 p-3"><div className="text-xs text-slate-400">{k}</div><div className="text-xl">{v}</div></div>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Files</div>{files.length === 0 ? <div className="text-slate-400">No files yet.</div> : files.map((f, i) => <div key={`${String(f.fileName ?? "file")}-${i}`}>{String(f.fileName ?? "file")}</div>)}</div>
        <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Timeline</div>{events.length === 0 ? <div className="text-slate-400">No events.</div> : events.map((e, i) => <div key={`${String(e.type ?? "event")}-${i}`} className="text-xs">{String(e.type ?? "event")} • {String(e.status ?? "")}</div>)}</div>
      </div>
      <ConfirmActivationPanel readiness={readiness} summary={summary as { canConfirm?: boolean } | null} />
      <div className="flex gap-3">
        <Link href={`/dashboard/onboarding-v2/${sessionId}/review`} className="underline">Review exceptions</Link>
        <Link href={`/dashboard/onboarding-v2/${sessionId}/summary`} className="underline">Final summary</Link>
      </div>
    </div>
  );
}

function UploadCard({ sessionId }: { sessionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const upload = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/onboarding-v2/sessions/${sessionId}/files/content`, { method: "POST", body: form });
    setStatus(res.ok ? "Uploaded" : "Upload failed");
  };
  return <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Upload legacy files</div><input type="file" accept=".csv,text/csv,application/csv,application/vnd.ms-excel" className="mt-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><button onClick={upload} className="ml-2 rounded bg-cyan-700 px-3 py-1">Upload</button><div className="mt-2 text-xs text-slate-400">{status}</div></div>;
}
