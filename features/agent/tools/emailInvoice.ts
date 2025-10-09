import { z } from "zod";
import type { ToolDef } from "../lib/toolTypes";

const In = z.object({
  toEmail: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1)
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
      // In dev, allow running without sending an email.
      return { ok: true };
    }
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${key}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.toEmail }] }],
        from: { email: "no-reply@profixiq.app", name: "ProFixIQ" },
        subject: input.subject,
        content: [{ type: "text/html", value: input.html }]
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SendGrid failed: ${res.status} ${text}`);
    }
    return { ok: true };
  }
};
