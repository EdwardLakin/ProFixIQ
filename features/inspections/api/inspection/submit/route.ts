import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { generateQuoteFromInspection } from "@quotes/lib/quote/generateQuoteFromInspection";
import { generateQuotePDFBytes } from "@work-orders/lib/work-orders/generateQuotePdf";
import { sendQuoteEmail } from "@shared/lib/email/email/sendQuoteEmail";
import { generateInspectionSummary } from "@inspections/lib/inspection/generateInspectionSummary";

import type { Database } from "@shared/types/types/supabase";
import type { InspectionSession, QuoteLineItem } from "@inspections/lib/inspection/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    inspectionSession,
    workOrderId,
    customerEmail,
  }: {
    inspectionSession: InspectionSession;
    workOrderId: string;
    customerEmail: string;
  } = body;

  if (!inspectionSession || !workOrderId || !customerEmail) {
    return NextResponse.json({ error: "Missing input" }, { status: 400 });
  }

  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 1) Structured inspection summary
    const summary = generateInspectionSummary(inspectionSession);
    const summaryText = typeof summary === "string" ? summary : summary?.summaryText ?? "";

    // 2) Flatten inspection items and create a quote
    const allItems = inspectionSession.sections.flatMap((s) => s.items);
    const { quote } = await generateQuoteFromInspection(allItems);

    // 3) Normalize to QuoteLineItem[]
    const quoteItems: QuoteLineItem[] = quote.map((line, index) => ({
      id: `${index}-${line.item}`,
      item: line.item || "",
      name: line.item || "",
      description: line.description || "",
      status: (line.status as QuoteLineItem["status"]) || "fail",
      notes: line.notes || "",
      laborHours: line.laborTime ?? 0,
      price: (line.laborRate ?? 0) * (line.laborTime ?? 0),
      part: line.parts?.[0]
        ? {
            name: line.parts[0].name ?? "",
            price:
              typeof line.parts[0].price === "number"
                ? line.parts[0].price
                : Number(line.parts[0].price ?? 0),
          }
        : undefined,
      partName: line.parts?.[0]?.name ?? "",
      partPrice:
        typeof line.parts?.[0]?.price === "number"
          ? line.parts[0].price
          : Number(line.parts?.[0]?.price ?? 0),
      photoUrls: [],
    }));

    // 4) Generate PDF bytes
    const pdfBytes = await generateQuotePDFBytes(quoteItems, summaryText);

    // 5) Upload to Supabase storage
    const fileName = `quotes/${workOrderId}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("quotes")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      throw new Error("PDF upload failed: " + uploadError.message);
    }

    const { data } = supabase.storage.from("quotes").getPublicUrl(fileName);
    const publicUrl = data?.publicUrl ?? null;

    // 6) Email the quote (URL + attachment)
    await sendQuoteEmail({
      to: customerEmail,
      workOrderId,
      pdfBuffer: Buffer.from(pdfBytes).toString("base64"),
      pdfUrl: publicUrl ?? undefined,
    });

    return NextResponse.json({ success: true, quoteUrl: publicUrl });
  } catch (error) {
    console.error("🚨 Error generating and sending quote:", error);
    return NextResponse.json(
      { error: "Failed to generate and send quote" },
      { status: 500 },
    );
  }
}