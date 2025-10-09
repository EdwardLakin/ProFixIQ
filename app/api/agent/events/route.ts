import { NextRequest } from "next/server";
import { getServerSupabase } from "@/features/agent/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return new Response("runId required", { status: 400 });

  const supabase = getServerSupabase();

  // Parse Last-Event-ID for resumable streams
  const lastEventId = Number(req.headers.get("last-event-id") ?? "0");

  const stream = new ReadableStream({
    async start(controller) {
      let step = lastEventId || 0;
      const encoder = new TextEncoder();

      // Helper to push events
      const push = (id: number, data: unknown) => {
        controller.enqueue(encoder.encode(`id: ${id}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial backfill
      const initial = await supabase
        .from("agent_events")
        .select("step, kind, content, created_at, id")
        .eq("run_id", runId)
        .gt("step", step)
        .order("step", { ascending: true });

      if (initial.error) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify(initial.error)}\n\n`));
        controller.close();
        return;
      }

      for (const ev of initial.data ?? []) {
        step = ev.step;
        push(step, { step: ev.step, kind: ev.kind, content: ev.content, created_at: ev.created_at, id: ev.id });
      }

      // Polling loop (simple, robust). Stops when run is not running.
      async function loop() {
        try {
          // Check run status
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

          for (const ev of more.data ?? []) {
            step = ev.step;
            push(step, { step: ev.step, kind: ev.kind, content: ev.content, created_at: ev.created_at, id: ev.id });
          }

          if (status === "running") {
            setTimeout(loop, 900); // ~1s cadence
          } else {
            controller.close();
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: String(e) })}\n\n`));
          controller.close();
        }
      }
      loop();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    }
  });
}
