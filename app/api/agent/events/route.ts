import type { NextRequest } from "next/server";
import { getServerSupabase } from "@/features/agent/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentEventRow = {
  step: number;
  kind: string;
  content: unknown;
  created_at: string;
  id: string;
};

type AgentEventOut = Record<string, unknown> & {
  step: number;
  kind: string;
  created_at: string;
  id: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickWorkOrderId(v: unknown): string | undefined {
  if (!isRecord(v)) return undefined;
  const candidates = [
    v.workOrderId,
    v.work_order_id,
    v.wo_id,
    v.id,
    isRecord(v.output) ? v.output.workOrderId : undefined,
    isRecord(v.output) ? v.output.work_order_id : undefined,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function normalizeRowToEvent(row: AgentEventRow): AgentEventOut {
  const base: AgentEventOut = {
    step: row.step,
    kind: row.kind,
    created_at: row.created_at,
    id: row.id,
  };

  const content = row.content;

  // Flatten JSONB content -> top-level fields
  const merged: AgentEventOut = isRecord(content) ? { ...base, ...content } : base;

  // Normalize tool events so UI can read them consistently
  if (merged.kind === "tool_call") {
    // allow either {name} or {tool}
    const name = typeof merged.name === "string" ? merged.name : undefined;
    const tool = typeof merged.tool === "string" ? merged.tool : undefined;

    return {
      ...merged,
      name: name ?? tool ?? "unknown",
      tool: tool ?? name ?? "unknown",
    };
  }

  if (merged.kind === "tool_result") {
    const name = typeof merged.name === "string" ? merged.name : undefined;
    const tool = typeof merged.tool === "string" ? merged.tool : undefined;

    const workOrderId = pickWorkOrderId(merged);

    return {
      ...merged,
      name: name ?? tool ?? "unknown",
      tool: tool ?? name ?? "unknown",
      ...(workOrderId ? { workOrderId } : {}),
    };
  }

  // Normalize wo.created (sometimes content may only contain it nested)
  if (merged.kind === "wo.created" || merged.kind === "work_order.created") {
    const workOrderId = pickWorkOrderId(merged);
    return {
      ...merged,
      ...(workOrderId ? { workOrderId } : {}),
    };
  }

  return merged;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return new Response("runId required", { status: 400 });

  const supabase = getServerSupabase();
  const lastEventId = Number(req.headers.get("last-event-id") ?? "0");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let step = lastEventId || 0;
      const encoder = new TextEncoder();

      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      const push = (id: number, data: unknown) => {
        write(`id: ${id}\n`);
        write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Backfill
      const initial = await supabase
        .from("agent_events")
        .select("step, kind, content, created_at, id")
        .eq("run_id", runId)
        .gt("step", step)
        .order("step", { ascending: true });

      if (initial.error) {
        write(`event: error\ndata: ${JSON.stringify(initial.error)}\n\n`);
        controller.close();
        return;
      }

      for (const raw of (initial.data ?? []) as unknown[]) {
        if (!isRecord(raw)) continue;

        const row: AgentEventRow = {
          step: typeof raw.step === "number" ? raw.step : step,
          kind: typeof raw.kind === "string" ? raw.kind : "unknown",
          content: raw.content,
          created_at: typeof raw.created_at === "string" ? raw.created_at : "",
          id: typeof raw.id === "string" ? raw.id : "",
        };

        step = row.step;
        push(step, normalizeRowToEvent(row));
      }

      // Polling loop
      async function loop() {
        try {
          const statusRes = await supabase
            .from("agent_runs")
            .select("status")
            .eq("id", runId)
            .single();

          if (statusRes.error) throw statusRes.error;
          const status = statusRes.data?.status;

          const more = await supabase
            .from("agent_events")
            .select("step, kind, content, created_at, id")
            .eq("run_id", runId)
            .gt("step", step)
            .order("step", { ascending: true });

          if (more.error) throw more.error;

          for (const raw of (more.data ?? []) as unknown[]) {
            if (!isRecord(raw)) continue;

            const row: AgentEventRow = {
              step: typeof raw.step === "number" ? raw.step : step,
              kind: typeof raw.kind === "string" ? raw.kind : "unknown",
              content: raw.content,
              created_at: typeof raw.created_at === "string" ? raw.created_at : "",
              id: typeof raw.id === "string" ? raw.id : "",
            };

            step = row.step;
            push(step, normalizeRowToEvent(row));
          }

          if (status === "running") {
            setTimeout(loop, 900);
          } else {
            controller.close();
          }
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
          write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
          controller.close();
        }
      }

      loop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}