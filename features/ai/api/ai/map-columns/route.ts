import { NextResponse } from "next/server";
import { mapCsvColumns } from "@ai/lib/ai/mapColumns";

export async function POST(req: Request) {
  const { headers } = await req.json();

  if (!headers || !Array.isArray(headers)) {
    return NextResponse.json(
      { error: "Missing headers array" },
      { status: 400 },
    );
  }

  try {
    const mapping = await mapCsvColumns(headers);
    return NextResponse.json({ mapping });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to map columns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
