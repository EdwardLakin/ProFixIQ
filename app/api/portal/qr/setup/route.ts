export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { sendPortalInviteEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

type Body = {
  shopSlug?: string;
  email?: string;
  name?: string;
  phone?: string;
  notes?: string;
  next?: string;
};

type CustomersInsert = Database["public"]["Tables"]["customers"]["Insert"];

type ShopRow = {
  id: string;
  slug: string | null;
  name: string | null;
  shop_name: string | null;
  accepts_online_booking: boolean | null;
};

const MAX_FIELD = 256;
const MAX_NOTES = 2000;

function trimField(value: unknown, max = MAX_FIELD): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeEmail(value: unknown): string {
  return trimField(value).toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isSafeInternalNextPath(next: string): boolean {
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.includes("\n") || next.includes("\r")) return false;
  return true;
}

function normalizeSiteUrl(raw: string): string {
  const trimmed = String(raw || "").trim().replace(/\/$/, "");
  if (!trimmed) return "https://profixiq.com";

  const lower = trimmed.toLowerCase();
  if (!/^https?:\/\//i.test(lower)) {
    return `https://${lower}`;
  }

  return lower;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const shopSlug = trimField(body.shopSlug);
    const email = normalizeEmail(body.email);
    const name = trimField(body.name);
    const phone = trimField(body.phone);
    const notes = trimField(body.notes, MAX_NOTES);
    const nextPath = trimField(body.next);

    if (!shopSlug || !email) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    const safeNext = isSafeInternalNextPath(nextPath) ? nextPath : "/portal";

    const { data: shop, error: shopError } = await supabaseAdmin
      .from("shops")
      .select("id,slug,name,shop_name,accepts_online_booking")
      .eq("slug", shopSlug)
      .eq("accepts_online_booking", true)
      .maybeSingle<ShopRow>();

    if (shopError) {
      return NextResponse.json({ ok: false, error: "Shop lookup failed" }, { status: 500 });
    }

    if (!shop?.id) {
      return NextResponse.json({ ok: false, error: "Shop not found" }, { status: 404 });
    }

    const shopId = shop.id;
    const { data: existingCustomer } = await supabaseAdmin
      .from("customers")
      .select("id, name, phone, phone_number")
      .eq("shop_id", shopId)
      .eq("email", email)
      .limit(1)
      .maybeSingle<{ id: string; name: string | null; phone: string | null; phone_number: string | null }>();

    let customerId = existingCustomer?.id ?? null;

    if (!customerId) {
      const insertPayload: CustomersInsert = {
        shop_id: shopId,
        email,
        user_id: null,
        name: name || null,
        phone: phone || null,
        notes: notes || null,
      };

      const { data: createdCustomer, error: createError } = await supabaseAdmin
        .from("customers")
        .insert(insertPayload)
        .select("id")
        .single<{ id: string }>();

      if (createError || !createdCustomer?.id) {
        return NextResponse.json({ ok: false, error: "Unable to process request" }, { status: 500 });
      }

      customerId = createdCustomer.id;
    } else if (existingCustomer) {
      const patch: Database["public"]["Tables"]["customers"]["Update"] = {};
      if (!existingCustomer.name && name) patch.name = name;
      if (!existingCustomer.phone && !existingCustomer.phone_number && phone) patch.phone = phone;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("customers").update(patch).eq("id", customerId);
      }
    }

    const { data: existingInvite } = await supabaseAdmin
      .from("customer_portal_invites")
      .select("id")
      .eq("customer_id", customerId)
      .eq("email", email)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (!existingInvite?.id) {
      const token = crypto.randomBytes(32).toString("hex");
      const { error: inviteError } = await supabaseAdmin.from("customer_portal_invites").insert({
        customer_id: customerId,
        email,
        token,
      });

      if (inviteError) {
        return NextResponse.json({ ok: false, error: "Unable to process request" }, { status: 500 });
      }
    }

    const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || "");
    const redirectTo = `${siteUrl}/portal/auth/confirm?next=${encodeURIComponent(safeNext)}`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkError) {
      return NextResponse.json({ ok: false, error: "Unable to process request" }, { status: 500 });
    }

    const portalLink = linkData?.properties?.action_link || null;

    if (!portalLink || typeof portalLink !== "string") {
      return NextResponse.json({ ok: false, error: "Unable to process request" }, { status: 500 });
    }

    const brand = await getActiveBrandForRender(shopId);
    const shopName = (shop.shop_name ?? "").trim() || (shop.name ?? "").trim() || "ProFixIQ";

    await sendPortalInviteEmail({
      shopId,
      to: email,
      portalLink,
      shopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
      createdBy: null,
    });

    // TODO: add IP/email-based rate limiting when shared limiter infra is available.
    return NextResponse.json({
      ok: true,
      message: "If the email is valid, we sent a portal access link.",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
