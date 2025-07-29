import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-only
);

export async function sendQuoteEmail({
  to,
  workOrderId,
  pdfBuffer,
}: {
  to: string;
  workOrderId: string;
  pdfBuffer: string; // base64-encoded string
}) {
  const subject = `Inspection Summary & Quote – Work Order ${workOrderId}`;
  const text = `Attached is your inspection summary and quote for Work Order ${workOrderId}.`;

  const { error } = await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject,
      text,
      attachments: [
        {
          filename: `Inspection_Summary_${workOrderId}.pdf`,
          content: pdfBuffer,
        },
      ],
    },
  });

  if (error) {
    console.error('Failed to send quote email:', error);
    throw error;
  }
}