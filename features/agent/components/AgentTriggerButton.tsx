//features/agent/components/AgentTriggerButton.tsx

"use client";
import { useEffect, useState } from "react";

type StreamEvent = {
  step: number;
  kind: "plan" | "tool_call" | "tool_result" | "info" | "error" | "final";
  content: unknown;
  created_at: string;
  id: string;
};

export default function AgentTriggerButton({
  defaultGoal,
  defaultContext
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
          context: defaultContext ?? {
            customerId: "REPLACE-CUSTOMER-UUID",
            vehicleId: "REPLACE-VEHICLE-UUID",
            lineDescription: "Front brake pads & rotors",
            jobType: "repair",
            laborHours: 3,
            partCost: 220,
            emailInvoiceTo: "customer@example.com"
          },
          idempotencyKey: crypto.randomUUID()
        })
      });
      const json: { runId?: string; error?: string } = await res.json();
      if (!res.ok || !json.runId) throw new Error(json.error ?? "Agent failed");
      setRunId(json.runId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={loading} className="btn btn-primary">
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
    const es = new EventSource(url.toString(), { withCredentials: true });

    es.onmessage = (msg: MessageEvent<string>) => {
      try {
        const data: StreamEvent = JSON.parse(msg.data) as StreamEvent;
        setEvents(prev => [...prev, data]);
      } catch {
        // ignore bad event
      }
    };
    es.onerror = () => { es.close(); };

    return () => es.close();
  }, [runId]);

  return (
    <div className="rounded border p-2 max-h-96 overflow-auto">
      {events.map((ev) => (
        <div key={ev.id} className="border-b py-2">
          <div className="text-xs opacity-70">#{ev.step} — {ev.kind}</div>
          <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(ev.content, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}