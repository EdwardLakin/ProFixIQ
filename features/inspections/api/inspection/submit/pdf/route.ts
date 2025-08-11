import { NextResponse } from "next/server";
import { generateInspectionPDF } from "@inspections/lib/inspection/pdf";
import { headers } from "next/headers";

export async function POST(req: Request) {
  try {
    // read JSON body
    const { summary } = await req.json();

    // headers() is async in your runtime – await it
    const h = await headers();
    const filename = h.get("x-filename")?.trim() || "inspection.pdf";

    // Allow a few common shapes, all normalized to Uint8Array
    const raw = (await generateInspectionPDF(summary)) as
      | Uint8Array
      | ArrayBuffer
      | ArrayBufferView
      | number[]
      | Blob
      | null
      | undefined;

    let bytes: Uint8Array;

    if (raw instanceof Uint8Array) {
      bytes = raw;
    } else if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw);
    } else if (ArrayBuffer.isView(raw)) {
      // Covers DataView and other typed arrays
      bytes = new Uint8Array(raw.buffer);
    } else if (Array.isArray(raw)) {
      bytes = new Uint8Array(raw as number[]);
    } else if (raw && typeof (raw as any).arrayBuffer === "function") {
      // Blob-like
      const ab = await (raw as Blob).arrayBuffer();
      bytes = new Uint8Array(ab);
    } else {
      bytes = new Uint8Array(0);
    }

    // Send the bytes directly; no Blob construction needed
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}