import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let vin: string | null = null;
    let userId: string | null = null;

    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as {
        vin?: string;
        user_id?: string;
      };
      vin = (body.vin ?? "").toString().trim();
      userId = body.user_id ? String(body.user_id) : null;
    } else {
      const form = await req.formData();
      vin = (form.get("vin") ?? "").toString().trim();
      const u = form.get("user_id");
      userId = u ? String(u) : null;
    }

    if (!vin || vin.length !== 17) {
      return NextResponse.json(
        { error: "Invalid VIN: must be a 17-character VIN." },
        { status: 400 },
      );
    }

    const apiRes = await fetch(
      \`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/\${encodeURIComponent(
        vin,
      )}?format=json\`,
    );

    if (!apiRes.ok) {
      return NextResponse.json(
        { error: \`VIN decode failed (\${apiRes.status})\` },
        { status: 502 },
      );
    }

    const data = (await apiRes.json()) as any;
    const row = data?.Results?.[0] ?? {};

    const result = {
      year: row.ModelYear || null,
      make: row.Make || null,
      model: row.Model || null,
      trim: row.Series || row.Trim || null,
      engine:
        row.EngineModel ||
        row.EngineConfiguration ||
        row.DisplacementL ||
        null,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("VIN decode error", err);
    return NextResponse.json(
      { error: "Unexpected error decoding VIN." },
      { status: 500 },
    );
  }
}
