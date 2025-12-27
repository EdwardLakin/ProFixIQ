// app/api/inspections/submit/pdf/route.ts
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { generateInspectionPDF } from "@inspections/lib/inspection/pdf";
import type { InspectionSession } from "@inspections/lib/inspection/types";

export const runtime = "nodejs";

type PdfLike =
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | number[]
  | Blob
  | null
  | undefined;

export async function POST(req: Request) {
  try {
    const { summary } = (await req.json()) as {
      summary: InspectionSession;
    };

    const h = await headers();
    const filename = h.get("x-filename")?.trim() || "inspection.pdf";

    const raw = (await generateInspectionPDF(summary)) as PdfLike;
    let bytes: Uint8Array;

    if (raw instanceof Uint8Array) {
      bytes = raw;
    } else if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw);
    } else if (ArrayBuffer.isView(raw)) {
      bytes = new Uint8Array(raw.buffer);
    } else if (Array.isArray(raw)) {
      bytes = new Uint8Array(raw);
    } else if (raw instanceof Blob) {
      const ab = await raw.arrayBuffer();
      bytes = new Uint8Array(ab);
    } else {
      bytes = new Uint8Array(0);
    }

    return new NextResponse(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}