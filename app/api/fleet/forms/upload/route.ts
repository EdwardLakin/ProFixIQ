import { NextResponse } from "next/server";

import { POST as createInspectionFormImport } from "../../../inspection-form-imports/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compatibility endpoint for older clients. New uploads use the same durable,
 * shop-scoped queue as the mobile and desktop import screens. Authentication,
 * roles, and tenant scope are enforced by the canonical route's
 * requireShopScopedApiAccess boundary.
 */
export async function POST(req: Request) {
  const legacyData = await req.formData();
  const file = legacyData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing file (expected multipart/form-data with 'file')" },
      { status: 400 },
    );
  }

  const canonicalData = new FormData();
  canonicalData.append("files", file);

  const fields = ["vehicleType", "dutyClass"] as const;
  for (const field of fields) {
    const value = legacyData.get(field);
    if (typeof value === "string" && value.trim()) {
      canonicalData.set(field, value);
    }
  }

  const titleHint = legacyData.get("titleHint");
  if (typeof titleHint === "string" && titleHint.trim()) {
    canonicalData.set("title", titleHint);
  }

  const headers = new Headers(req.headers);
  headers.delete("content-length");
  headers.delete("content-type");

  const delegatedRequest = new Request(
    new URL("/api/inspection-form-imports", req.url),
    {
      method: "POST",
      headers,
      body: canonicalData,
    },
  );
  const response = await createInspectionFormImport(delegatedRequest);
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", '</api/inspection-form-imports>; rel="successor-version"');
  return response;
}
