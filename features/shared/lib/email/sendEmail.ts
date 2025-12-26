// features/shared/lib/email/sendEmail.ts

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Only safe on the server!
);

export async function sendBookingConfirmation({
  customerEmail,
  customerName,
  vehicle,
  services,
  estimatedTotal,
  appointmentTime,
}: {
  customerEmail: string;
  customerName: string;
  vehicle: string;
  services: string[];
  estimatedTotal: string;
  appointmentTime: string;
}) {
  const emailContent = `
    Hi ${customerName},

    Your booking with ProFixIQ has been confirmed!

    📅 Appointment Time: ${appointmentTime}
    🚗 Vehicle: ${vehicle}
    🧰 Services: ${services.join(", ")}
    💰 Estimated Total: ${estimatedTotal}

    If you have any questions or need to reschedule, contact us at support@profixiq.com.

    Thanks for choosing ProFixIQ!
  `;

  const { error } = await supabase.functions.invoke("send-email", {
    body: {
      to: customerEmail,
      subject: "Booking Confirmation – ProFixIQ",
      text: emailContent,
    },
  });

  if (error) {
    console.error("Failed to send booking confirmation:", error);
    throw error;
  }
}
