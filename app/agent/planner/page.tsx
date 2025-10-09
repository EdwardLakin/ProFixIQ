"use client";

import { useEffect, useRef, useState } from "react";

type PlannerKind = "simple" | "openai";
type AgentStartOut = { runId: string; alreadyExists: boolean };

/** narrow unknown to string safely for UI */
function toMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as Error).message;
  }
  try { return String(e); } catch { return "Unknown error"; }
}

export default function PlannerPage() {
  const [goal, setGoal] = useState("");
  const [planner, setPlanner] = useState<PlannerKind>("openai");
  const [customerQuery, setCustomerQuery] = useState("");
  const [plateOrVin, setPlateOrVin] = useState("");
  const [emailInvoiceTo, setEmailInvoiceTo] = useState("");
  const [status, setStatus] = useState<string>("");
  const [runId, setRunId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // cleanup EventSource when leaving page
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  async function start() {
    setStatus("Starting…");
    esRef.current?.close();
    esRef.current = null;

    try {
      const ctx = {
        customerQuery: customerQuery || undefined,
        plateOrVin: plateOrVin || undefined,
        emailInvoiceTo: emailInvoiceTo || undefined,
      } as Record<string, unknown>;

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          planner,
          context: ctx,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
      }

      const out = (await res.json()) as AgentStartOut;
      setRunId(out.runId);
      setStatus(`Run ${out.runId} ${out.alreadyExists ? "(resumed)" : "started"} — streaming…`);

      // connect SSE
      const url = `/api/agent/events?runId=${encodeURIComponent(out.runId)}`;
      const es = new EventSource(url, { withCredentials: false });
      esRef.current = es;

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { kind?: string; [k: string]: unknown };
          const line = data?.kind ? `[${data.kind}] ${JSON.stringify(data)}` : JSON.stringify(data);
          setStatus((s) => (s ? s + "\n" + line : line));
        } catch {
          setStatus((s) => (s ? s + "\n" + ev.data : ev.data));
        }
      };
      es.onerror = () => {
        setStatus((s) => (s ? s + "\n(stream closed)" : "(stream closed)"));
        es.close();
      };
    } catch (e: unknown) {
      setStatus(`Error: ${toMsg(e)}`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-black text-orange-400" style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}>
        AI Planner
      </h1>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className="text-sm text-neutral-400 mb-1">Goal</div>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Find John Smith by name, create inspection WO, add note, email invoice"
            className="w-full min-h-[96px] p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
          />
        </label>

        <div className="grid gap-3">
          <label className="block">
            <div className="text-sm text-neutral-400 mb-1">Planner</div>
            <select
              value={planner}
              onChange={(e) => setPlanner((e.target.value as PlannerKind) ?? "openai")}
              className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
            >
              <option value="openai">OpenAI (rich)</option>
              <option value="simple">Simple (rules)</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm text-neutral-400 mb-1">Customer query (name)</div>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
              placeholder="e.g. John Smith"
            />
          </label>

          <label className="block">
            <div className="text-sm text-neutral-400 mb-1">Plate or VIN</div>
            <input
              value={plateOrVin}
              onChange={(e) => setPlateOrVin(e.target.value)}
              className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
              placeholder="e.g. 8ABC123 or 1FT…"
            />
          </label>

          <label className="block">
            <div className="text-sm text-neutral-400 mb-1">Email invoice to (optional)</div>
            <input
              value={emailInvoiceTo}
              onChange={(e) => setEmailInvoiceTo(e.target.value)}
              className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
              placeholder="customer@example.com"
              type="email"
              inputMode="email"
            />
          </label>
        </div>
      </div>

      <button
        onClick={start}
        className="bg-orange-500 text-black px-4 py-2 rounded font-black"
        disabled={!goal.trim()}
      >
        Run Plan
      </button>

      <div className="text-xs text-neutral-500">
        {runId ? <>Run ID: <code>{runId}</code></> : null}
      </div>

      <pre className="whitespace-pre-wrap bg-neutral-900 p-4 rounded text-sm text-neutral-200 border border-neutral-800 min-h-[160px]">
        {status}
      </pre>
    </div>
  );
}
