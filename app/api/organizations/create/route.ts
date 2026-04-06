export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type CreateOrgBody = {
  name?: string;
};

const ALLOWED_ROLES = new Set(["owner", "admin"]);

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CreateOrgBody;
    const name = safeString(body.name);

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "Organization name is required" },
        { status: 400 },
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role, shop_id, organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json(
        { ok: false, error: profileErr?.message ?? "Profile not found" },
        { status: 403 },
      );
    }

    const role = String(profile.role ?? "").toLowerCase();
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (profile.organization_id) {
      return NextResponse.json(
        { ok: false, error: "This profile is already linked to an organization" },
        { status: 400 },
      );
    }

    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id, organization_id")
      .eq("id", profile.shop_id)
      .maybeSingle();

    if (shopErr || !shop) {
      return NextResponse.json(
        { ok: false, error: shopErr?.message ?? "Shop not found" },
        { status: 404 },
      );
    }

    if (shop.organization_id) {
      return NextResponse.json(
        { ok: false, error: "This shop is already linked to an organization" },
        { status: 400 },
      );
    }

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name,
      } as DB["public"]["Tables"]["organizations"]["Insert"])
      .select("id, name")
      .single();

    if (orgErr || !org) {
      return NextResponse.json(
        { ok: false, error: orgErr?.message ?? "Failed to create organization" },
        { status: 500 },
      );
    }

    const { error: profileUpdateErr } = await supabase
      .from("profiles")
      .update({
        organization_id: org.id,
      } as DB["public"]["Tables"]["profiles"]["Update"])
      .eq("id", user.id);

    if (profileUpdateErr) {
      return NextResponse.json(
        { ok: false, error: profileUpdateErr.message },
        { status: 500 },
      );
    }

    const { error: shopUpdateErr } = await supabase
      .from("shops")
      .update({
        organization_id: org.id,
      } as DB["public"]["Tables"]["shops"]["Update"])
      .eq("id", profile.shop_id);

    if (shopUpdateErr) {
      return NextResponse.json(
        { ok: false, error: shopUpdateErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      organization: {
        id: org.id,
        name: org.name,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error creating organization";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
