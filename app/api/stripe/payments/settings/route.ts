export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";
import { readBoundedJson } from "@/features/shared/lib/server/bounded-json";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  getShopPaymentSettings,
  saveShopPaymentSettings,
} from "@/features/stripe/lib/server/shop-payment-settings";

const REQUEST_MAX_BYTES = 8 * 1024;
const settingsSchema = z.object({
  portal_payments_enabled: z.boolean().optional(),
  default_currency: z.enum(["cad", "usd"]).optional(),
  allow_partial_payments: z.boolean().optional(),
  minimum_payment_cents: z.number().int().min(50).optional(),
  default_deposit_percent: z.number().min(0).max(100).optional(),
  require_payment_before_release: z.boolean().optional(),
  receipt_email_enabled: z.boolean().optional(),
}).strict();

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageBilling",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  try {
    const settings = await getShopPaymentSettings(
      createAdminSupabase(),
      access.profile.shop_id,
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageBilling",
    allowRoles: ["owner", "admin"],
    requireOwnerPin: true,
    ownerPinRequest: req,
    ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.BILLING, OWNER_PIN_PURPOSES.PRIVILEGED],
  });
  if (!access.ok) return access.response;

  const body = await readBoundedJson(req, REQUEST_MAX_BYTES);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.reason === "too_large" ? "Request too large" : "Invalid request" },
      { status: body.reason === "too_large" ? 413 : 400 },
    );
  }
  const parsed = settingsSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment settings" }, { status: 400 });
  }

  try {
    const settings = await saveShopPaymentSettings(
      createAdminSupabase(),
      access.profile.shop_id,
      parsed.data,
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 },
    );
  }
}
