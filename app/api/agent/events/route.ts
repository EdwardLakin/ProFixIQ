import type { NextRequest } from "next/server";
import { getServerSupabase } from "@/features/agent/server/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return new Response("runId required", { status: 400 });

  const supabase = getServerSupabase();
  const lastEventId = Number(req.headers.get("last-event-id") ?? "0");

  const stream = new ReadableStream({
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
      for (const ev of initial.data ?? []) {
        step = ev.step;
        push(step, { step: ev.step, kind: ev.kind, content: ev.content, created_at: ev.created_at, id: ev.id });
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
          const status: string | null | undefined = statusRes.data?.status;

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
            setTimeout(loop, 900);
          } else {
            controller.close();
          }
        } catch (e) {
          write(`event: error\ndata: ${JSON.stringify({ message: (e as Error)?.message ?? String(e) })}\n\n`);
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
