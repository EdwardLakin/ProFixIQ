"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Generic = Record<string, unknown>;

async function getJson(path: string): Promise<Generic> { const r = await fetch(path, { cache: "no-store" }); return (await r.json()) as Generic; }

export function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Generic | null>(null);
  const [events, setEvents] = useState<Generic[]>([]);
  const [summary, setSummary] = useState<Generic | null>(null);
  const [files, setFiles] = useState<Generic[]>([]);
  const [loading, setLoading] = useState(true);

  const terminal = ["completed", "failed", "cancelled"].includes(String(session?.status ?? ""));

  useEffect(() => {
    let active = true;
    const run = async () => {
      const [s, e, a, f] = await Promise.all([
        getJson(`/api/onboarding-v2/sessions/${sessionId}`),
        getJson(`/api/onboarding-v2/sessions/${sessionId}/events?limit=50`),
        getJson(`/api/onboarding-v2/sessions/${sessionId}/activation-summary`),
        getJson(`/api/onboarding-v2/sessions/${sessionId}/files`),
      ]);
      if (!active) return;
      setSession(s); setEvents((e.items as Generic[]) ?? []); setSummary(a); setFiles((f.items as Generic[]) ?? []); setLoading(false);
    };
    void run();
    const id = setInterval(() => { void run(); }, terminal ? 15000 : 7000);
    return () => { active = false; clearInterval(id); };
  }, [sessionId, terminal]);

  const metrics = useMemo(() => ({
    entities: Number(summary?.entityCount ?? 0), links: Number(summary?.linkCount ?? 0), review: Number(summary?.reviewCount ?? 0), staged: Number(summary?.stagedCount ?? 0),
  }), [summary]);

  const triggerAnalyze = async () => { await fetch(`/api/onboarding-v2/sessions/${sessionId}/analyze`, { method: "POST" }); };

  if (loading) return <div className="rounded-xl border border-white/10 p-4">Loading session…</div>;
  return <div className="space-y-4 text-sm text-slate-200">
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">Verify-only mode: activation can be previewed/smoked but live writes are blocked.</div>
    <div className="rounded-xl border border-white/10 p-4">Session <b>{sessionId}</b> • Status: {String(session?.status ?? "unknown")}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <UploadCard sessionId={sessionId} />
      <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Analyze</div><button onClick={triggerAnalyze} className="mt-3 rounded bg-cyan-600 px-3 py-2">Start processing</button></div>
    </div>
    <div className="grid gap-4 lg:grid-cols-4">{Object.entries(metrics).map(([k,v])=><div key={k} className="rounded-xl border border-white/10 p-3"><div className="text-xs text-slate-400">{k}</div><div className="text-xl">{v}</div></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Files</div>{files.length===0?<div className="text-slate-400">No files yet.</div>:files.map((f,i)=><div key={i}>{String(f.fileName ?? "file")}</div>)}</div>
      <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Timeline</div>{events.length===0?<div className="text-slate-400">No events.</div>:events.map((e,i)=><div key={i} className="text-xs">{String(e.type ?? "event")} • {String(e.status ?? "")}</div>)}</div>
    </div>
    <div className="rounded-xl border border-white/10 p-4">Historical work remains historical and is not converted to live work orders.</div>
    <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Confirm Activation</div><button disabled className="mt-2 rounded bg-slate-700 px-3 py-2 text-slate-300">Confirm activation (disabled)</button></div>
    <div className="flex gap-3"><Link href={`/dashboard/onboarding-v2/${sessionId}/review`} className="underline">Review exceptions</Link><Link href="#" className="opacity-50">Summary (Phase UI-3)</Link></div>
  </div>;
}

function UploadCard({ sessionId }: { sessionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const upload = async () => {
    if (!file) return;
    const form = new FormData(); form.append("file", file);
    const res = await fetch(`/api/onboarding-v2/sessions/${sessionId}/files/content`, { method: "POST", body: form });
    setStatus(res.ok ? "Uploaded" : "Upload failed");
  };
  return <div className="rounded-xl border border-white/10 p-4"><div className="font-semibold">Upload legacy files</div><input type="file" className="mt-2" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} /><button onClick={upload} className="ml-2 rounded bg-cyan-700 px-3 py-1">Upload</button><div className="text-xs text-slate-400 mt-2">{status}</div></div>;
}
