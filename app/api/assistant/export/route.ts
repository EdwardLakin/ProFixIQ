// app/api/assistant/export/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/features/shared/lib/server/openai";
import { getOpenAIModelForPurpose, openAITemperatureParam } from "@/features/shared/lib/server/openai-models";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const openai = getOpenAIClient();

type Vehicle = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string; attachments?: Array<{ id?: string; fileName?: string | null; note?: string | null }> };

function normalizeMarkdown(s: string): string {
  let out = (s ?? "").trim();
  out = out.replace(/\b(event:\s*done|data:\s*\[DONE\])\b/gi, "");
  out = out.replace(/(#{2,6})([^\s#])/g, (_m, hashes, rest) => `${hashes} ${rest}`);
  out = out.replace(/([.:;])([A-Za-z0-9])/g, "$1 $2");
  out = out.replace(/(\d+)\.\s*/g, "$1. ");
  out = out.replace(/(-|\*)\s*/g, "$1 ");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { vehicle, context, messages, workOrderLineId } = (await req.json()) as {
      vehicle?: Vehicle;
      context?: string;
      messages?: ChatMessage[];
      workOrderLineId?: string;
    };

    if (!vehicle?.year || !vehicle?.make || !vehicle?.model) {
      return NextResponse.json({ error: "Missing vehicle info." }, { status: 400 });
    }
    if (!workOrderLineId) {
      return NextResponse.json({ error: "Missing work order line id." }, { status: 400 });
    }

    const transcript = Array.isArray(messages)
      ? messages.filter(
          (message) =>
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.trim().length > 0,
        )
      : [];

    if (transcript.length === 0) {
      return NextResponse.json(
        { error: "Ask the assistant a question before exporting." },
        { status: 400 },
      );
    }

    const prompt = [
      `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      context?.trim() ? `Shop notes / complaint: ${context.trim()}` : null,
      "You are preparing a concise work-order entry for a shop management system.",
      "From the conversation below, produce:",
      "- Cause: one or two sentences (this is the diagnosis / story of what you found).",
      "- Correction: short bullet list (1–5 bullets).",
      "- EstimatedLaborTime: a decimal number in hours when appropriate, else null.",
      "",
      "Conversation (latest last):",
      ...transcript.map((m) => {
        const evidence = (m.attachments ?? [])
          .map((attachment) => attachment.fileName || attachment.id)
          .filter(Boolean)
          .join(", ");
        return `${m.role.toUpperCase()}: ${m.content}${evidence ? `\nEvidence images already saved to work_order_media: ${evidence}` : ""}`;
      }),
      "",
      'Return JSON with these exact keys: { "cause": string, "correction": string, "estimatedLaborTime": number | null }',
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: getOpenAIModelForPurpose("reasoning"),
      ...openAITemperatureParam(getOpenAIModelForPurpose("reasoning"), 0.3),
      stream: false,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      cause?: string;
      correction?: string;
      estimatedLaborTime?: number | null;
    };

    const cause = normalizeMarkdown(parsed.cause ?? "");
    const correction = normalizeMarkdown(parsed.correction ?? "");
    const estimatedLaborTime =
      typeof parsed.estimatedLaborTime === "number" ? parsed.estimatedLaborTime : null;

    if (!cause) {
      return NextResponse.json({ error: "Model did not return a valid cause." }, { status: 500 });
    }

    const { data: line, error: lineErr } = await access.supabase
      .from("work_order_lines")
      .select("id")
      .eq("id", workOrderLineId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle();

    if (lineErr) {
      return NextResponse.json({ error: "Failed to load work order line." }, { status: 500 });
    }
    if (!line) {
      return NextResponse.json({ error: "Work order line not found." }, { status: 404 });
    }

    const updates: Database["public"]["Tables"]["work_order_lines"]["Update"] = {
      cause,
      correction,
      labor_time: estimatedLaborTime,
    };

    const { data: updated, error: updateErr } = await access.supabase
      .from("work_order_lines")
      .update(updates)
      .eq("id", workOrderLineId)
      .eq("shop_id", access.profile.shop_id)
      .select("cause, correction, labor_time")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: "Failed to save story to work order line." }, { status: 500 });
    }

    return NextResponse.json({
      cause: updated?.cause ?? cause,
      correction: updated?.correction ?? correction,
      estimatedLaborTime:
        typeof updated?.labor_time === "number"
          ? (updated.labor_time as number)
          : estimatedLaborTime,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
