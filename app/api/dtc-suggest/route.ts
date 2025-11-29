// app/api/work-orders/dtc-suggest/route.ts
import { NextResponse } from "next/server";
import { openai } from "lib/server/openai"; // adjust path if needed
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { jobId } = (await req.json()) as { jobId?: string };
    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 },
      );
    }

    const supabase = await createAdminSupabase();

    // Load job + minimal context
    const { data: job, error: jobErr } = await supabase
      .from("work_order_lines")
      .select("id, complaint, cause, correction, labor_time, work_order_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 },
      );
    }

    let vehicle: {
      year?: number | null;
      make?: string | null;
      model?: string | null;
    } | null = null;

    if (job.work_order_id) {
      const { data: wo } = await supabase
        .from("work_orders")
        .select("vehicle_id")
        .eq("id", job.work_order_id)
        .maybeSingle();

      if (wo?.vehicle_id) {
        const { data: v } = await supabase
          .from("vehicles")
          .select("year, make, model")
          .eq("id", wo.vehicle_id)
          .maybeSingle();

        if (v) {
          vehicle = {
            year: v.year ?? null,
            make: v.make ?? null,
            model: v.model ?? null,
          };
        }
      }
    }

    const complaint =
      job.complaint ||
      "No explicit complaint recorded – infer from job description and DTC context.";

    // Call OpenAI – ask for structured JSON
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.1",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are an expert automotive diagnostician writing clear, shop-friendly job notes.",
            "Given a vehicle and complaint, generate:",
            "- cause: 1–3 sentences describing root cause using DTC-style language when appropriate.",
            "- correction: 2–6 sentences describing what was/will be done, including key checks and specs (but no torque numbers).",
            "- laborTime: a reasonable flat-rate style estimate in hours.",
            "Respond ONLY as JSON with keys: cause, correction, laborTime.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            vehicle,
            complaint,
            existingCause: job.cause,
            existingCorrection: job.correction,
            existingLaborTime: job.labor_time,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { cause?: string; correction?: string; laborTime?: number } =
      {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // fall through to a generic error
    }

    if (!parsed.cause || !parsed.correction) {
      return NextResponse.json(
        { error: "Model did not return a valid suggestion." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      suggestion: {
        cause: parsed.cause,
        correction: parsed.correction,
        laborTime:
          typeof parsed.laborTime === "number" ? parsed.laborTime : null,
      },
    });
  } catch (err: any) {
    console.error("[dtc-suggest] error", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected error" },
      { status: 500 },
    );
  }
}