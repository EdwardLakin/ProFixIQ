// @shared/lib/email/email/sendQuoteEmail.ts
import { createClient } from "@supabase/supabase-js";

/**
 * NOTE: keep this module server-only. Do not import it in client components.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only key
);

export type SendQuoteEmailParams = {
  to: string;
  workOrderId: string;
  /** Base64-encoded PDF bytes (optional). */
  pdfBuffer?: string;
  /** Public URL to the PDF (optional). */
  pdfUrl?: string | null;
};

export async function sendQuoteEmail({
  to,
  workOrderId,
  pdfBuffer,
  pdfUrl,
}: SendQuoteEmailParams): Promise<void> {
  const subject = `Inspection Summary & Quote – Work Order ${workOrderId}`;

  const linkLine = pdfUrl ? `\n\nView your quote online: ${pdfUrl}` : "";
  const text =
    `Attached is your inspection summary and quote for Work Order ${workOrderId}.` +
    (pdfBuffer ? "" : "\n\n(No attachment was included.)") +
    linkLine;

  // Build the payload conditionally
  const body: Record<string, unknown> = {
    to,
    subject,
    text,
  };

  if (pdfBuffer) {
    body.attachments = [
      {
        filename: `Inspection_Summary_${workOrderId}.pdf`,
        content: pdfBuffer, // base64 string
      },
    ];
  }

  const { error } = await supabase.functions.invoke("send-email", { body });

  if (error) {
    console.error("Failed to send quote email:", error);
    throw error;
  }
}