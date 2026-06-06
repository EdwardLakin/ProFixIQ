export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { sendPortalInviteEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";


type Body = {
  email?: string;
  next?: string;
};

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

function isValidEmail(value: string): boolean {
  return value.includes("@") && value.includes(".");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const next = typeof body.next === "string" ? body.next.trim() : "";

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Missing email" },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "Invalid email" },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<{ shop_id: string | null }>();

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: profileError.message },
        { status: 500 },
      );
    }

    const shopId = profile?.shop_id ?? null;

    if (!shopId) {
      return NextResponse.json(
        { ok: false, error: "No active shop found for user" },
        { status: 400 },
      );
    }

    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, shop_name, name")
      .eq("id", shopId)
      .maybeSingle<{ id: string; shop_name: string | null; name: string | null }>();

    if (shopError) {
      return NextResponse.json(
        { ok: false, error: shopError.message },
        { status: 500 },
      );
    }

    const shopName =
      (shop?.shop_name ?? "").trim() ||
      (shop?.name ?? "").trim() ||
      "ProFixIQ";

    const brand = await getActiveBrandForRender(shopId);

    const siteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || "");
    const safeNext = isSafeInternalNextPath(next) ? next : "/portal";
    const redirectTo = `${siteUrl}/portal/auth/confirm?next=${encodeURIComponent(
      safeNext,
    )}`;

    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });

    if (linkError) {
      return NextResponse.json(
        { ok: false, error: linkError.message },
        { status: 500 },
      );
    }

    const portalLink =
      linkData?.properties?.action_link ||
      linkData?.properties?.hashed_token ||
      null;

    if (!portalLink || typeof portalLink !== "string") {
      return NextResponse.json(
        { ok: false, error: "Failed to generate portal magic link" },
        { status: 500 },
      );
    }

    await sendPortalInviteEmail({
      shopId,
      to: email,
      portalLink,
      shopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
      createdBy: user.id,
    });

    return NextResponse.json({
      ok: true,
      email,
      shopId,
      shopName,
      redirectTo,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
