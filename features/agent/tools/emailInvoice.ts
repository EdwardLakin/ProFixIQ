import { z } from "zod";
import type { ToolDef } from "../lib/toolTypes";
import { normalizeEmailSubject } from "@/features/email/server/emailSubjects";

const In = z.object({
  toEmail: z.string().email(),
  subject: z.string().trim().min(1).transform((value) => normalizeEmailSubject(value) ?? "Invoice from ProFixIQ"),
  html: z.string().min(1),
});
export type EmailInvoiceIn = z.infer<typeof In>;

const Out = z.object({ ok: z.boolean() });
export type EmailInvoiceOut = z.infer<typeof Out>;

export const toolEmailInvoice: ToolDef<EmailInvoiceIn, EmailInvoiceOut> = {
  name: "email_invoice",
  description: "Email HTML invoice using SendGrid (SERVER).",
  inputSchema: In,
  outputSchema: Out,
  async run(input) {
    const key = process.env.SENDGRID_API_KEY;

    if (!key) {
      console.warn("[toolEmailInvoice] SENDGRID_API_KEY missing; skipping send in dev");
      return { ok: true };
    }

    const fromEmail =
      process.env.SENDGRID_FROM_EMAIL?.trim() || "support@profixiq.com";
    const fromName =
      process.env.SENDGRID_FROM_NAME?.trim() || "ProFixIQ";

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: input.toEmail }],
            subject: input.subject,
          },
        ],
        from: {
          email: fromEmail,
          name: fromName,
        },
        content: [
          {
            type: "text/html",
            value: input.html,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `[toolEmailInvoice] SendGrid error: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`,
      );
    }

    return { ok: true };
  },
};
