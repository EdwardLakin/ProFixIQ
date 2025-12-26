// @shared/lib/email/email/sendQuoteEmail.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type CustomerRow = DB["public"]["Tables"]["customers"]["Row"];

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only key
);

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? "";
const SENDGRID_QUOTE_TEMPLATE_ID =
  process.env.SENDGRID_QUOTE_TEMPLATE_ID ?? "d-your-quote-template-id";

if (!SENDGRID_API_KEY) {
  console.warn("[sendQuoteEmail] SENDGRID_API_KEY is not set");
}
if (!SENDGRID_QUOTE_TEMPLATE_ID) {
  console.warn("[sendQuoteEmail] SENDGRID_QUOTE_TEMPLATE_ID is not set");
}

export type QuoteEmailLine = {
  description: string;
  amount?: number | null;
};

export type QuoteVehicleInfo = {
  year?: string | null;
  make?: string | null;
  model?: string | null;
  [key: string]: unknown;
};

export type SendQuoteEmailParams = {
  to: string;
  workOrderId: string;

  /** Optional quote total (for template display). */
  quoteTotal?: number | null;

  /** Public URL to the quote PDF (optional). */
  pdfUrl?: string | null;

  customerName?: string | null;
  shopName?: string | null;
  lines?: QuoteEmailLine[];
  vehicleInfo?: QuoteVehicleInfo | null;
};

export async function sendQuoteEmail(params: SendQuoteEmailParams): Promise<void> {
  const {
    to,
    workOrderId,
    quoteTotal,
    pdfUrl,
    customerName,
    shopName,
    lines,
    vehicleInfo,
  } = params;

  if (!SENDGRID_API_KEY || !SENDGRID_QUOTE_TEMPLATE_ID) {
    throw new Error(
      "[sendQuoteEmail] SENDGRID_API_KEY or SENDGRID_QUOTE_TEMPLATE_ID not configured",
    );
  }

  const safeShopName = shopName ?? "your repair shop";

  // ----------------------- SendGrid email ----------------------- //
  type DynamicData = {
    workOrderId: string;
    customerName?: string | null;
    shopName?: string | null;
    quoteTotal?: number | null;
    pdfUrl?: string | null;
    vehicleInfo?: QuoteVehicleInfo | null;
    lines?: QuoteEmailLine[];
  };

  type Personalization = {
    to: Array<{ email: string; name?: string | null }>;
    dynamic_template_data: DynamicData;
  };

  type SendGridMailPayload = {
    personalizations: Personalization[];
    from: { email: string; name?: string };
    template_id: string;
  };

  const dynamicData: DynamicData = {
    workOrderId,
    customerName: customerName ?? null,
    shopName: safeShopName,
    quoteTotal: quoteTotal ?? null,
    pdfUrl: pdfUrl ?? null,
    vehicleInfo: vehicleInfo ?? null,
    lines: lines ?? [],
  };

  const emailPayload: SendGridMailPayload = {
    personalizations: [
      {
        to: [{ email: to, name: customerName ?? null }],
        dynamic_template_data: dynamicData,
      },
    ],
    from: { email: "no-reply@profixiq.com", name: "ProFixIQ" },
    template_id: SENDGRID_QUOTE_TEMPLATE_ID,
  };

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[sendQuoteEmail] SendGrid error:", text);
    throw new Error(`SendGrid error: ${text}`);
  }

  // ----------------------- Portal wiring ----------------------- //
  // 1) Attach quote_url to the work order if we have a URL
  if (pdfUrl) {
    const { error: woUpdateErr } = await supabase
      .from("work_orders")
      .update({ quote_url: pdfUrl })
      .eq("id", workOrderId);

    if (woUpdateErr) {
      console.error(
        "[sendQuoteEmail] Failed to update work order quote_url:",
        woUpdateErr,
      );
    }
  }

  // 2) Create portal notification so the bell lights up for the customer
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id")
    .eq("id", workOrderId)
    .maybeSingle<Pick<WorkOrderRow, "id" | "shop_id" | "customer_id">>();

  if (woErr || !wo?.customer_id) {
    if (woErr) {
      console.error(
        "[sendQuoteEmail] Failed to load work order for notification:",
        woErr,
      );
    }
    return;
  }

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, user_id")
    .eq("id", wo.customer_id)
    .maybeSingle<Pick<CustomerRow, "id" | "user_id">>();

  if (custErr || !customer || !customer.user_id) {
    if (custErr) {
      console.error(
        "[sendQuoteEmail] Failed to resolve customer for notification:",
        custErr,
      );
    }
    return;
  }

  const { error: notifErr } = await supabase.from("portal_notifications").insert({
    user_id: customer.user_id,
    customer_id: customer.id,
    work_order_id: workOrderId,
    kind: "quote_ready", // ensure this is allowed by your portal_notifications.kind constraint
    title: "Quote ready",
    body: `Your quote for Work Order ${workOrderId} at ${safeShopName} is ready to review in your portal.`,
  });

  if (notifErr) {
    console.error(
      "[sendQuoteEmail] Failed to insert portal quote notification:",
      notifErr,
    );
  }
}