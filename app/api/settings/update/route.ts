// app/api/settings/update/route.ts
import { NextResponse } from "next/server";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";

const ADMIN_ROLES = new Set(["owner", "admin", "manager"]);

// Whitelist fields that can be updated from Settings
const ALLOWED_FIELDS = new Set([
  // NA + identity
  "country",
  "timezone",
  "shop_name",
  "name",

  // address
  "street",
  "address",
  "city",
  "province",
  "postal_code",

  // contact
  "phone_number",
  "email",
  "logo_url",

  // numeric settings
  "labor_rate",
  "supplies_percent",
  "diagnostic_fee",
  "tax_rate",

  // boolean flags
  "use_ai",
  "require_cause_correction",
  "require_authorization",
  "email_on_complete",
  "auto_generate_pdf",
  "auto_send_quote_email",

  // text
  "invoice_terms",
  "invoice_footer",
]);

type Payload = {
  shopId?: string;
  update?: Record<string, unknown>;
};

function isNaCountry(v: unknown): v is "US" | "CA" {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "US" || s === "CA";
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({
      cookies: nextCookies,
    });

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

    // 3) Role + shop scope check
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    if (!profile?.shop_id || profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const role = String(profile.role ?? "").toLowerCase();
    if (!ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4) Require valid owner-PIN cookie for this shop
    const cookieStore = await nextCookies();
    const pinCookie = cookieStore.get(COOKIE_NAME)?.value;
    if (!pinCookie || pinCookie !== shopId) {
      return NextResponse.json({ error: "Owner PIN required" }, { status: 401 });
    }

    // 5) Filter payload to allowed fields only + normalize
    const safeUpdate: Record<string, unknown> = {};

    const numericKeys = new Set([
      "labor_rate",
      "supplies_percent",
      "diagnostic_fee",
      "tax_rate",
    ]);

    const booleanKeys = new Set([
      "use_ai",
      "require_cause_correction",
      "require_authorization",
      "email_on_complete",
      "auto_generate_pdf",
      "auto_send_quote_email",
    ]);

    for (const [k, v] of Object.entries(update)) {
      if (!ALLOWED_FIELDS.has(k)) continue;

      if (k === "country") {
        if (!isNaCountry(v)) continue; // ignore invalid
        safeUpdate.country = String(v).trim().toUpperCase();
        continue;
      }

      if (k === "timezone") {
        const tz = String(v ?? "").trim();
        if (!tz) continue;
        safeUpdate.timezone = tz;
        continue;
      }

      if (numericKeys.has(k)) {
        if (v === null || v === "") {
          safeUpdate[k] = null;
        } else if (typeof v === "number") {
          safeUpdate[k] = Number.isFinite(v) ? v : null;
        } else {
          const n = Number(v);
          safeUpdate[k] = Number.isFinite(n) ? n : null;
        }
        continue;
      }

      if (booleanKeys.has(k)) {
        safeUpdate[k] = Boolean(v);
        continue;
      }

      // strings
      safeUpdate[k] = typeof v === "string" ? v.trim() : v;
    }

    // 5b) Keep legacy columns in sync (street/address, name/shop_name)
    const incoming = safeUpdate;

    // If either street/address provided, mirror the other
    const street = typeof incoming.street === "string" ? incoming.street : null;
    const address = typeof incoming.address === "string" ? incoming.address : null;
    const resolvedStreet = street ?? address;
    if (resolvedStreet && typeof resolvedStreet === "string") {
      incoming.street = resolvedStreet;
      incoming.address = resolvedStreet;
    }

    // Keep name + shop_name aligned if one is set
    const shopName =
      typeof incoming.shop_name === "string" ? incoming.shop_name : null;
    const name = typeof incoming.name === "string" ? incoming.name : null;
    const resolvedName = shopName ?? name;
    if (resolvedName && typeof resolvedName === "string") {
      incoming.shop_name = resolvedName;
      incoming.name = resolvedName;
    }

    if (Object.keys(incoming).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    // 6) Update shops
    const { error: updErr } = await supabase
      .from("shops")
      .update(incoming)
      .eq("id", shopId);

    if (updErr) {
      return NextResponse.json(
        { error: updErr.message ?? "Update failed" },
        { status: 500 },
      );
    }

    // 7) Keep shop_profiles country/province in sync (best-effort)
    const profilePatch: Record<string, unknown> = {};
    if (incoming.country) profilePatch.country = incoming.country;
    if (incoming.province) profilePatch.province = incoming.province;

    if (Object.keys(profilePatch).length > 0) {
      const { error: spErr } = await supabase
        .from("shop_profiles")
        .upsert({ shop_id: shopId, ...profilePatch } as any, {
          onConflict: "shop_id",
        });

      // Do not fail the whole request if profile sync fails, but report if needed
      if (spErr) {
        return NextResponse.json({
          ok: true,
          warning: `Saved shop, but failed to sync shop_profiles: ${spErr.message}`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings.update error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}