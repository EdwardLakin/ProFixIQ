"use client";
import { useEffect, useState } from "react";

type Item = { id?: string; severity?: string; status?: string; title?: string; message?: string };

export function ReviewItemsQueue({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState("open");
  useEffect(() => {
    void fetch(`/api/onboarding-v2/sessions/${sessionId}/review-items?status=${encodeURIComponent(status)}&limit=100`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { items?: Item[] }) => setItems(j.items ?? []));
  }, [sessionId, status]);

  return <div className="space-y-4">
    <div className="rounded-xl border border-white/10 p-4">Normal records do not require manual review; only exceptions appear here.</div>
    <div className="flex gap-2">{["open","resolved"].map((s)=><button key={s} onClick={()=>setStatus(s)} className="rounded border border-white/20 px-3 py-1">{s}</button>)}</div>
    <div className="rounded-xl border border-white/10 p-4">
      {items.length===0 ? <div>No exceptions found</div> : items.map((item, i)=><div key={item.id ?? i} className="border-b border-white/10 py-2"><span>{item.severity ?? "unknown"}</span> • <span>{item.status ?? "unknown"}</span> • {item.title ?? item.message ?? "Review item"}</div>)}
    </div>
  </div>;
}
