import { NextRequest, NextResponse } from "next/server";
import { generateLaborTimeEstimate } from "@ai/lib/ai/generateLaborTimeEstimate";

export async function POST(req: NextRequest) {
  try {
    const { complaint, jobType } = await req.json();

    if (!complaint || !jobType) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const hours = await generateLaborTimeEstimate(complaint, jobType);

    return NextResponse.json({ hours });
  } catch (err) {
    console.error("API error generating labor time:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
