import { NextRequest, NextResponse } from "next/server";
import { generateQuoteFromInspection } from "@/lib/quote/generateQuoteFromInspection";
import { InspectionResultItem } from "@/lib/quote/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const results: InspectionResultItem[] = body.results;

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ error: "Invalid or missing results." }, { status: 400 });
    }

    const { summary, quote } = generateQuoteFromInspection(results);

    return NextResponse.json({ summary, quote });
  } catch (err) {
    console.error("Quote generation failed:", err);
    return NextResponse.json({ error: "Internal error generating quote." }, { status: 500 });
  }
}