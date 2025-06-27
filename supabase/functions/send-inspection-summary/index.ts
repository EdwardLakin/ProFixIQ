/// <reference types="https://deno.land/x/supabase_edge_functions/types.ts" />

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.3";

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Missing environment variables", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { inspectionId, customerEmail } = await req.json();

  if (!inspectionId || !customerEmail) {
    return new Response("Missing inspectionId or customerEmail", { status: 400 });
  }

  const { data: inspection, error: fetchError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .single();

  if (fetchError || !inspection) {
    return new Response("Failed to fetch inspection data", { status: 500 });
  }

  // Generate PDF
  const { generatePdfBuffer } = await import("../../_shared/pdf.ts");
  const pdfBuffer = await generatePdfBuffer(inspection);

  const fileName = `inspection-summary-${inspectionId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("inspection-pdfs")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return new Response(`PDF upload failed: ${uploadError.message}`, { status: 500 });
  }

  // Send email
  const emailResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: customerEmail,
      subject: "Your Inspection Summary",
      html: `Hello, your inspection summary is ready.<br><a href="${SUPABASE_URL}/storage/v1/object/public/inspection-pdfs/${fileName}">View PDF</a>`,
    }),
  });

  if (!emailResponse.ok) {
    return new Response("Failed to send email", { status: 500 });
  }

  return new Response("Inspection summary sent", { status: 200 });
});