import { NextRequest, NextResponse } from "next/server";
import { generateQuoteFromInspection } from "@shared/lib/quote/generateQuoteFromInspection";
import { generateQuotePDF } from "@shared/lib/work-orders/generateQuotePdf";
import { sendQuoteEmail } from "@shared/lib/email/sendQuoteEmail";
import { generateInspectionSummary } from "@shared/lib/inspection/generateInspectionSummary";
import { createClient } from "@shared/lib/supabase/server";
import type { InspectionSession } from "@shared/lib/inspection/types";
import type { QuoteLineItem } from "@shared/lib/inspection/types";

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
    const supabase = createClient();

    // ✅ Generate structured inspection summary
    const summary = generateInspectionSummary(inspectionSession);

    // ✅ Flatten inspection items
    const allItems = inspectionSession.sections.flatMap(
      (section) => section.items,
    );

    // ✅ Generate quote from items
    const { quote } = await generateQuoteFromInspection(allItems);

    // ✅ Normalize to QuoteLineItem[]
    const quoteItems: QuoteLineItem[] = quote.map((line, index) => ({
      id: `${index}-${line.item}`,
      item: line.item || "",
      partName: line.parts?.[0]?.name || "TBD",
      partPrice: Number(line.parts?.[0]?.price) || 0,
      labor: Number(line.laborTime) || 0,
      rate: Number(line.laborRate) || 120,
      hours: Number(line.laborTime) || 1,
      total:
        (Number(line.parts?.[0]?.price) || 0) + (Number(line.laborTime) || 0),
      job_type: line.type || "repair",
      status: line.status || "fail",
      notes: line.notes || "",
      description: line.description || "",
      price: 0,
      part: {
        name: line.parts?.[0]?.name || "",
        price: Number(line.parts?.[0]?.price) || 0,
      },
      source2: line.source2 || "inspection",
      photoUrls: [],
    }));

    // ✅ Generate PDF
    const pdfBlob = await generateQuotePDF(quoteItems, summary);
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfBase64 = buffer.toString("base64");

    // ✅ Upload PDF to Supabase storage
    const fileName = `quotes/${workOrderId}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("quotes")
      .upload(fileName, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error("PDF upload failed: " + uploadError.message);
    }

    const { data } = supabase.storage.from("quotes").getPublicUrl(fileName);
    const publicUrl = data?.publicUrl;

    // ✅ Send email
    await sendQuoteEmail({
      to: customerEmail,
      workOrderId,
      pdfBuffer: pdfBase64,
      pdfUrl: publicUrl,
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
