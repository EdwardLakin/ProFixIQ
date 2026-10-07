export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { submitEarlyAccessApplication } from "@/features/ops/server/earlyAccessApplications";

type Body = {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  companyName?: unknown;
  location?: unknown;
  operationType?: unknown;
  locationCount?: unknown;
  technicianCount?: unknown;
  teamSize?: unknown;
  fleetAssetCount?: unknown;
  currentSoftware?: unknown;
  primaryChallenge?: unknown;
  interestedSurfaces?: unknown;
  purchaseTimeline?: unknown;
  feedbackCommitment?: unknown;
  offerTermsAccepted?: unknown;
  source?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  website?: unknown;
};

function optionalNumber(value: unknown): number | null {
  if (value === "" || value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  try {
    await submitEarlyAccessApplication({
      fullName: typeof body.fullName === "string" ? body.fullName : "",
      email: typeof body.email === "string" ? body.email : "",
      phone: typeof body.phone === "string" ? body.phone : undefined,
      companyName: typeof body.companyName === "string" ? body.companyName : "",
      location: typeof body.location === "string" ? body.location : undefined,
      operationType: typeof body.operationType === "string" ? body.operationType : "",
      locationCount: optionalNumber(body.locationCount) ?? 0,
      technicianCount: optionalNumber(body.technicianCount),
      teamSize: optionalNumber(body.teamSize),
      fleetAssetCount: optionalNumber(body.fleetAssetCount),
      currentSoftware: typeof body.currentSoftware === "string" ? body.currentSoftware : undefined,
      primaryChallenge: typeof body.primaryChallenge === "string" ? body.primaryChallenge : "",
      interestedSurfaces: Array.isArray(body.interestedSurfaces)
        ? body.interestedSurfaces.filter((value): value is string => typeof value === "string")
        : [],
      purchaseTimeline: typeof body.purchaseTimeline === "string" ? body.purchaseTimeline : undefined,
      feedbackCommitment: body.feedbackCommitment === true,
      offerTermsAccepted: body.offerTermsAccepted === true,
      source: typeof body.source === "string" ? body.source : undefined,
      utmSource: typeof body.utmSource === "string" ? body.utmSource : undefined,
      utmMedium: typeof body.utmMedium === "string" ? body.utmMedium : undefined,
      utmCampaign: typeof body.utmCampaign === "string" ? body.utmCampaign : undefined,
      website: typeof body.website === "string" ? body.website : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit early access application.";
    console.error("[public/early-access]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
