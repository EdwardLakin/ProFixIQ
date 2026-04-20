// app/api/settings/update/route.ts
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";

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
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBranding",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.SETTINGS, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    // 1) Parse body (UNCHANGED)
    const { shopId, update } = (await req.json().catch(() => ({}))) as Payload;
    if (!shopId || !update || typeof update !== "object") {
      return NextResponse.json(
        { error: "Missing shopId or update payload" },
        { status: 400 },
      );
    }

    // 2) shop scope check
    if (access.profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3) Filter payload to allowed fields only + normalize
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
        if (!isNaCountry(v)) continue;
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

      safeUpdate[k] = typeof v === "string" ? v.trim() : v;
    }

    // 3b) Keep legacy columns in sync (street/address, name/shop_name)
    const incoming = safeUpdate;

    const street = typeof incoming.street === "string" ? incoming.street : null;
    const address = typeof incoming.address === "string" ? incoming.address : null;
    const resolvedStreet = street ?? address;
    if (resolvedStreet && typeof resolvedStreet === "string") {
      incoming.street = resolvedStreet;
      incoming.address = resolvedStreet;
    }

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

    // 4) Update shops
    const { error: updErr } = await access.supabase
      .from("shops")
      .update(incoming)
      .eq("id", shopId);

    if (updErr) {
      return NextResponse.json(
        { error: updErr.message ?? "Update failed" },
        { status: 500 },
      );
    }

    // 5) Keep shop_profiles country/province in sync (best-effort)
    type ShopProfileInsert =
      Database["public"]["Tables"]["shop_profiles"]["Insert"];

    const profilePatch: ShopProfileInsert = { shop_id: shopId };

if (typeof incoming.country === "string") {
  profilePatch.country = incoming.country;
}

if (typeof incoming.province === "string") {
  profilePatch.province = incoming.province;
}
    if (Object.keys(profilePatch).length > 1) {
      const { error: spErr } = await access.supabase
        .from("shop_profiles")
        .upsert(profilePatch, { onConflict: "shop_id" });

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
