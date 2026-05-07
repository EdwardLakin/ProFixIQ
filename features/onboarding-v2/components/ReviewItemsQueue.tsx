"use client";

import React from "react";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentReadinessBanner } from "@/features/onboarding-v2/components/AgentReadinessBanner";
import { defaultAgentReadiness, normalizeAgentReadiness, type AgentReadiness } from "@/features/onboarding-v2/lib/agentReadiness";

type Item = { id?: string; severity?: string; status?: string; title?: string; message?: string; kind?: string };

function toItems(payload: unknown): Item[] {
  if (Array.isArray(payload)) return payload as Item[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)) {
    return (payload as { items: Item[] }).items;
  }
  return [];
}

export function ReviewItemsQueue({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");
  const [readiness, setReadiness] = useState<AgentReadiness>(defaultAgentReadiness());

  useEffect(() => {
    void fetch(`/api/onboarding-v2/agent-readiness`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: unknown) => setReadiness(normalizeAgentReadiness(j)))
      .catch(() => setReadiness(defaultAgentReadiness()));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({ status, limit: "100" });
    if (severity !== "all") query.set("severity", severity);
    void fetch(`/api/onboarding-v2/sessions/${sessionId}/review-items?${query.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: unknown) => setItems(toItems(j)));
  }, [sessionId, severity, status]);

  const displayItems = items.filter((item) => String(item.kind ?? "exception") !== "normal");

  return <div className="space-y-4">
    <AgentReadinessBanner readiness={readiness} />
    <div className="rounded-xl border border-white/10 p-4">Read-only exception queue. Resolve actions are intentionally disabled until the backend resolve endpoint is finalized.</div>
    <div className="flex gap-2">{["open", "resolved"].map((s) => <button key={s} onClick={() => setStatus(s)} className="rounded border border-white/20 px-3 py-1">{s}</button>)}</div>
    <div className="flex gap-2">{["all", "low", "medium", "high", "critical"].map((s) => <button key={s} onClick={() => setSeverity(s)} className="rounded border border-white/20 px-3 py-1">{s}</button>)}</div>
    <div className="rounded-xl border border-white/10 p-4">
      {displayItems.length === 0 ? <div>No exceptions found.</div> : displayItems.map((item, i) => <div key={item.id ?? i} className="border-b border-white/10 py-2"><span>{item.severity ?? "unknown"}</span> • <span>{item.status ?? "unknown"}</span> • {item.title ?? item.message ?? "Review item"}</div>)}
    </div>
    <div><Link href={`/dashboard/onboarding-v2/${sessionId}/summary`} className="underline">Open final summary</Link></div>
  </div>;
}
