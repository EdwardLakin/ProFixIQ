import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";

// Whitelist fields that can be updated from Settings
const ALLOWED_FIELDS = new Set([
  "name",
  "address",
  "city",
  "province",
  "postal_code",
  "phone_number",
  "email",
  "logo_url",

  "labor_rate",
  "supplies_percent",
  "diagnostic_fee",
  "tax_rate",

  "use_ai",
  "require_cause_correction",
  "require_authorization",

  "invoice_terms",
  "invoice_footer",
  "email_on_complete",

  "auto_generate_pdf",
  "auto_send_quote_email",
]);

type Payload = {
  shopId?: string;
  update?: Record<string, unknown>;
};

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 1) Auth required
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse body
    const { shopId, update } = (await req.json().catch(() => ({}))) as Payload;
    if (!shopId || !update || typeof update !== "object") {
      return NextResponse.json(
        { error: "Missing shopId or update payload" },
        { status: 400 },
      );
    }

    // 3) Role + shop scope check (staff of this shop)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id || profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4) Require valid owner-PIN cookie for this shop
    const pinCookie = (await cookies()).get(COOKIE_NAME)?.value;
    if (!pinCookie || pinCookie !== shopId) {
      return NextResponse.json(
        { error: "Owner PIN required" },
        { status: 401 },
      );
    }

    // 5) Filter payload to allowed fields only
    const safeUpdate: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(update)) {
      if (!ALLOWED_FIELDS.has(k)) continue;
      // basic numeric coercion for number fields (null allowed)
      if (
        ["labor_rate", "supplies_percent", "diagnostic_fee", "tax_rate"].includes(k)
      ) {
        safeUpdate[k] =
          v === null || v === "" ? null : typeof v === "number" ? v : Number(v);
        continue;
      }
      // boolean flags
      if (
        [
          "use_ai",
          "require_cause_correction",
          "require_authorization",
          "email_on_complete",
          "auto_generate_pdf",
          "auto_send_quote_email",
        ].includes(k)
      ) {
        safeUpdate[k] = Boolean(v);
        continue;
      }
      // strings / text
      safeUpdate[k] = v;
    }

    if (Object.keys(safeUpdate).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // 6) Update only within this shop
    const { error: updErr } = await supabase
      .from("shops")
      .update(safeUpdate)
      .eq("id", shopId);

    if (updErr) {
      return NextResponse.json(
        { error: updErr.message ?? "Update failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings.update error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}