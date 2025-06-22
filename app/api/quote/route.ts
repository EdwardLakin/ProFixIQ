import { NextRequest, NextResponse } from "next/server";
import { generateQuoteFromInspection } from "@/lib/quote/generateQuoteFromInspection";
import { getFeatureAccess } from "@/lib/config/userTier";
import { InspectionState } from "@/lib/inspection/types";

// Optional: Replace with real auth/user lookup
const getUserTier = async (req: NextRequest): Promise<"diy" | "pro" | "pro+"> => {
  // Replace this mock with Supabase or session check
  return "pro+";
};

export async function POST(req: NextRequest) {
  try {
    const tier = await getUserTier(req);
    const features = getFeatureAccess(tier);

    if (!features.quoteGeneration) {
      return NextResponse.json({ error: "Upgrade required to generate quotes." }, { status: 403 });
    }

    const body = await req.json();
    const inspection: InspectionState = body.inspection;

    if (!inspection || !inspection.sections) {
      return NextResponse.json({ error: "Invalid inspection data." }, { status: 400 });
    }

    const quote = generateQuoteFromInspection(inspection);
    return NextResponse.json({ quote });

  } catch (err) {
    console.error("Quote API error:", err);
    return NextResponse.json({ error: "Failed to generate quote." }, { status: 500 });
  }
}