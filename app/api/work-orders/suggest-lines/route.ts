import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import OpenAI from "openai";

type DB = Database;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const { jobId } = (await req.json()) as { jobId?: string };
    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    // 1) Load job line + WO + vehicle for context
    const { data: job } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, vehicle_id, complaint, job_type")
      .eq("id", jobId)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("id, year, make, model, vin")
      .eq("id", job.vehicle_id)
      .maybeSingle();

    const { data: wo } = await supabase
      .from("work_orders")
      .select("id, customer_id, notes")
      .eq("id", job.work_order_id)
      .maybeSingle();

    // Optional: any DTCs recorded for this vehicle
    const { data: dtcs } = await supabase
      .from("vehicle_dtcs")
      .select("code, description")
      .eq("vehicle_id", job.vehicle_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Optional: recent history on this vehicle (last 18 months)
    const since = new Date();
    since.setMonth(since.getMonth() - 18);
    const { data: history } = await supabase
      .from("work_order_lines")
      .select("id, description, complaint, job_type, status, created_at")
      .eq("vehicle_id", job.vehicle_id)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(25);

    // 2) Ask AI for structured suggestions
    const system = `You are a service writer assistant for an auto repair shop.
Given a job complaint and vehicle context, suggest 3–6 actionable repair/maintenance line items.
Return only JSON in this schema:
[
  {
    "name": string,              // e.g. "Front brake pad replacement"
    "laborHours": number,        // decimal hours estimate, e.g. 1.8
    "jobType": "diagnosis" | "repair" | "maintenance" | "tech-suggested",
    "notes": string              // short why/what context for the tech/advisor
  }
]`;

    const user = {
      jobContext: {
        complaint: job.complaint ?? "",
        jobType: job.job_type ?? "",
      },
      vehicle: vehicle
        ? {
            year: String(vehicle.year ?? ""),
            make: vehicle.make ?? "",
            model: vehicle.model ?? "",
            vin: vehicle.vin ?? "",
          }
        : null,
      dtcs: (dtcs ?? []).map((d) => `${d.code} ${d.description ?? ""}`),
      recentHistory: (history ?? []).map((h) => ({
        description: h.description ?? h.complaint ?? "",
        jobType: h.job_type ?? "",
        status: h.status ?? "",
        when: h.created_at,
      })),
      workOrderNotes: wo?.notes ?? "",
    };

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 600,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            "Suggest items relevant to this context. Prefer braking items if the complaint is 'brake squeal', etc. " +
            "If DTCs exist, include 1–2 diagnostic/confirmation steps where appropriate. " +
            "Return ONLY valid JSON with no commentary.\n\n" +
            JSON.stringify(user, null, 2),
        },
      ],
    });

    // Try to parse JSON safely
    const raw = resp.choices?.[0]?.message?.content ?? "[]";
    let suggestions: Array<{
      name: string;
      laborHours: number;
      jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
      notes: string;
    }> = [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .filter(
            (x) =>
              x &&
              typeof x.name === "string" &&
              typeof x.laborHours === "number" &&
              typeof x.notes === "string"
          )
          .map((x) => ({
            name: x.name,
            laborHours: x.laborHours,
            jobType:
              x.jobType === "diagnosis" ||
              x.jobType === "repair" ||
              x.jobType === "maintenance" ||
              x.jobType === "tech-suggested"
                ? x.jobType
                : "tech-suggested",
            notes: x.notes,
          }));
      }
    } catch {
      // fallback to empty list
    }

    return NextResponse.json({ suggestions });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}