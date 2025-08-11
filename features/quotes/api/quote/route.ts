// app/api/quote/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateQuoteFromInspection } from "@quotes/lib/quote/generateQuoteFromInspection";
import { InspectionItem } from "@inspections/lib/inspection/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const results: InspectionItem[] = body.results;

    if (!results || !Array.isArray(results)) {
      return NextResponse.json(
        { error: "Invalid or missing results." },
        { status: 400 },
      );
    }

    const { summary, quote } = await generateQuoteFromInspection(results);
    return NextResponse.json({ summary, quote });
  } catch (err) {
    console.error("Quote generation failed:", err);
    return NextResponse.json(
      { error: "Internal error generating quote." },
      { status: 500 },
    );
  }
}
