"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Turn = { eventId: string; role: "user" | "assistant"; text: string; turnId: string | null };
type Context = {
  currentTask: string | null;
  complaint: string | null;
  conversation: Turn[];
  observations: Array<{ eventId: string; text: string }>;
  measurements: Array<{ eventId: string; label: string; value: string; unit: string | null }>;
  dtcs: string[];
};
type WorkOrder = {
  customId: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleUnitNumber: string | null;
};

type Snapshot = {
  sessionId?: string | null;
  session?: { id: string } | null;
  context: Context | null;
  workOrder: WorkOrder | null;
  reply?: string;
  error?: string;
};

export function TechnicianTextCopilot() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ context: null, workOrder: null });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/copilot/technician/session", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as Snapshot;
        if (!response.ok) throw new Error(body.error || "Unable to load CoPilot.");
        if (!cancelled) setSnapshot(body);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load CoPilot.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionId = snapshot.session?.id ?? snapshot.sessionId ?? null;
  const vehicleLabel = useMemo(() => {
    const workOrder = snapshot.workOrder;
    if (!workOrder) return null;
    const vehicle = [workOrder.vehicleYear, workOrder.vehicleMake, workOrder.vehicleModel]
      .filter(Boolean)
      .join(" ");
    const unit = workOrder.vehicleUnitNumber ? `Unit ${workOrder.vehicleUnitNumber}` : "";
    return [workOrder.customId, vehicle, unit].filter(Boolean).join(" · ");
  }, [snapshot.workOrder]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const response = await fetch("/api/copilot/technician/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId, turnId: crypto.randomUUID() }),
      });
      const body = (await response.json()) as Snapshot;
      if (!response.ok) throw new Error(body.error || "CoPilot could not process that turn.");
      setSnapshot((current) => ({
        ...current,
        ...body,
        session: body.session ?? (body.sessionId ? { id: body.sessionId } : current.session),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CoPilot could not process that turn.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-3xl p-4 text-sm text-muted-foreground">Loading Technician CoPilot…</main>;
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col gap-4 p-4 pb-28">
      <header className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phase 2 Preview · Text only</div>
        <h1 className="mt-1 text-2xl font-semibold">Technician CoPilot</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Continuous repair conversation and memory. Voice remains disconnected until this flow is proven.
        </p>
        {vehicleLabel ? <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm font-medium">{vehicleLabel}</div> : null}
      </header>

      {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</div> : null}

      <section className="flex min-h-[45vh] flex-col gap-3 rounded-2xl border bg-card p-4">
        {!snapshot.context?.conversation.length ? (
          <div className="my-auto text-center text-sm text-muted-foreground">
            Start naturally: “What do I have?” or “Start the Ford.”
          </div>
        ) : (
          snapshot.context.conversation.map((turn) => (
            <div
              key={turn.eventId}
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                turn.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted"
              }`}
            >
              {turn.text}
            </div>
          ))
        )}
      </section>

      {snapshot.context ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current repair memory</div>
            <div className="mt-2 text-sm"><span className="font-medium">Task:</span> {snapshot.context.currentTask ?? "Not established"}</div>
            <div className="mt-1 text-sm"><span className="font-medium">Complaint:</span> {snapshot.context.complaint ?? "None captured"}</div>
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence captured</div>
            <div className="mt-2 text-sm">{snapshot.context.observations.length} observations · {snapshot.context.measurements.length} measurements · {snapshot.context.dtcs.length} DTCs</div>
            {snapshot.context.observations.slice(-3).map((item) => (
              <div key={item.eventId} className="mt-1 text-xs text-muted-foreground">• {item.text}</div>
            ))}
          </div>
        </section>
      ) : null}

      <form onSubmit={send} className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={sessionId ? "Talk to your CoPilot…" : "Start a job naturally…"}
            className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !message.trim()} className="rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "…" : "Send"}
          </button>
        </div>
      </form>
    </main>
  );
}
