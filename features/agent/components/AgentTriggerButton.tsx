"use client";

import { useEffect, useState } from "react";

type StreamEvent = {
  step: number;
  kind: "plan" | "tool_call" | "tool_result" | "info" | "error" | "final";
  content: unknown;
  created_at: string;
  id: string;
};

function newIdempotencyKey(): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `idemp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function AgentTriggerButton({
  defaultGoal,
  defaultContext,
}: {
  defaultGoal?: string;
  defaultContext?: Record<string, unknown>;
}) {
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal: defaultGoal ?? "Create a brake job",
          context:
            defaultContext ?? {
              customerId: "REPLACE-CUSTOMER-UUID",
              vehicleId: "REPLACE-VEHICLE-UUID",
              lineDescription: "Front brake pads & rotors",
              jobType: "repair",
              laborHours: 3,
              partCost: 220,
              emailInvoiceTo: "customer@example.com",
            },
          idempotencyKey: newIdempotencyKey(),
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { runId?: string; error?: string }
        | null;

      if (!res.ok || !json?.runId) {
        throw new Error(json?.error ?? `Agent failed (status ${res.status})`);
      }

      setRunId(json.runId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn btn-primary"
        type="button"
      >
        {loading ? "Running…" : "Run ProFix Agent"}
      </button>

      {runId && <AgentEventStream runId={runId} />}
    </div>
  );
}

function AgentEventStream({ runId }: { runId: string }) {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    const url = new URL("/api/agent/events", window.location.origin);
    url.searchParams.set("runId", runId);

    const es = new EventSource(url.toString());

    es.onmessage = (msg: MessageEvent<string>) => {
      try {
        const data = JSON.parse(msg.data) as StreamEvent;
        setEvents((prev) => [...prev, data]);
      } catch {
        // ignore bad event
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => es.close();
  }, [runId]);

  return (
    <div className="rounded border p-2 max-h-96 overflow-auto">
      {events.map((ev) => (
        <div key={ev.id} className="border-b py-2">
          <div className="text-xs opacity-70">
            #{ev.step} — {ev.kind}
          </div>
          <pre className="text-sm whitespace-pre-wrap">
            {JSON.stringify(ev.content, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}