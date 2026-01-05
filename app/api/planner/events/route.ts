// app/api/planner/events/route.ts
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = {
  step: number;
  kind: string;
  content: unknown;
  created_at: string;
  id: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return new Response("runId required", { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return new Response("Unauthorized", { status: 401 });

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
        .from("planner_events")
        .select("step, kind, content, created_at, id")
        .eq("run_id", runId)
        .gt("step", step)
        .order("step", { ascending: true });

      if (initial.error) {
        write(`event: error\ndata: ${JSON.stringify({ message: initial.error.message })}\n\n`);
        controller.close();
        return;
      }

      for (const raw of (initial.data ?? []) as unknown[]) {
        if (!isRecord(raw)) continue;
        const row: EventRow = {
          step: typeof raw.step === "number" ? raw.step : step,
          kind: typeof raw.kind === "string" ? raw.kind : "unknown",
          content: raw.content,
          created_at: typeof raw.created_at === "string" ? raw.created_at : "",
          id: typeof raw.id === "string" ? raw.id : "",
        };
        step = row.step;
        push(step, isRecord(row.content) ? row.content : { kind: row.kind, content: row.content });
      }

      async function loop() {
        try {
          const statusRes = await supabase
            .from("planner_runs")
            .select("status")
            .eq("id", runId)
            .single();

          if (statusRes.error) throw statusRes.error;
          const status = statusRes.data?.status;

          const more = await supabase
            .from("planner_events")
            .select("step, kind, content, created_at, id")
            .eq("run_id", runId)
            .gt("step", step)
            .order("step", { ascending: true });

          if (more.error) throw more.error;

          for (const raw of (more.data ?? []) as unknown[]) {
            if (!isRecord(raw)) continue;
            const row: EventRow = {
              step: typeof raw.step === "number" ? raw.step : step,
              kind: typeof raw.kind === "string" ? raw.kind : "unknown",
              content: raw.content,
              created_at: typeof raw.created_at === "string" ? raw.created_at : "",
              id: typeof raw.id === "string" ? raw.id : "",
            };
            step = row.step;
            push(step, isRecord(row.content) ? row.content : { kind: row.kind, content: row.content });
          }

          if (status === "running") setTimeout(loop, 900);
          else controller.close();
        } catch (e) {
          const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
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