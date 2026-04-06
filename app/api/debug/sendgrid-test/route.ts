export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sendDynamicTemplateEmail } from "@/features/email/server/sendDynamicTemplateEmail";

type Body = {
  shopId?: string;
  to?: string;
  templateKey?: "portal_invite" | "quote_ready" | "invoice_ready" | "user_invite";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;

    const shopId = String(body?.shopId ?? "").trim();
    const to = String(body?.to ?? "").trim();
    const templateKey = body?.templateKey ?? "portal_invite";

    if (!shopId || !to) {
      return NextResponse.json(
        { error: "shopId and to are required" },
        { status: 400 },
      );
    }

    await sendDynamicTemplateEmail({
      shopId,
      to,
      templateKey,
      subject: templateKey === "user_invite" ? "You're invited to ProFixIQ" : null,
      dynamicTemplateData:
        templateKey === "portal_invite"
          ? {
              portal_link: "https://profixiq.com/portal",
              shop_name: "ProFixIQ Test Shop",
              year: new Date().getFullYear(),
            }
          : templateKey === "quote_ready"
            ? {
                quote_url: "https://profixiq.com/portal/quotes/test",
                quote_total: "$499.99",
                vehicle_label: "2020 Ford F-150",
                shop_name: "ProFixIQ Test Shop",
                year: new Date().getFullYear(),
              }
            : templateKey === "invoice_ready"
              ? {
                  portalUrl: "https://profixiq.com/portal/invoices/test",
                  portal_url: "https://profixiq.com/portal/invoices/test",
                  workOrderId: "WO-TEST-001",
                  invoiceTotal: 499.99,
                  laborTotal: 250.0,
                  partsTotal: 249.99,
                  customerName: "Test Customer",
                  shopName: "ProFixIQ Test Shop",
                  year: new Date().getFullYear(),
                }
              : {
                  login_url: "https://profixiq.com/sign-in",
                  username: "tech01",
                  temp_password: "TempPass123!",
                  role: "mechanic",
                  shop_name: "ProFixIQ Test Shop",
                  inviter_name: "Edward",
                  full_name: "Test User",
                  brand_name: "ProFixIQ",
                  support_email: "support@profixiq.com",
                  year: new Date().getFullYear(),
                },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
