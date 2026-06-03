export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShopUserAuthEmail,
  getAuthIdentifierStrategy,
  normalizeLoginUsername,
} from "@/features/users/lib/username";

type Body = { identifier?: string | null };

export async function POST(req: Request) {
  const { identifier = "" } = (await req.json().catch(() => ({}))) as Body;
  const strategy = getAuthIdentifierStrategy(identifier ?? "");

  if (strategy.inputKind !== "email") {
    return NextResponse.json({
      inputKind: strategy.inputKind,
      authEmail: strategy.authEmail,
      resolvedBy: "username",
    });
  }

  const contactEmail = strategy.authEmail;
  const supabase = createAdminSupabase();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, shop_id")
    .ilike("email", contactEmail)
    .not("username", "is", null)
    .limit(2);

  if (error) {
    console.info("[auth/resolve-login]", {
      inputKind: strategy.inputKind,
      resolved: false,
      error: error.message,
    });
    return NextResponse.json({ inputKind: strategy.inputKind, authEmail: strategy.authEmail });
  }

  if ((profiles ?? []).length === 1) {
    const username = normalizeLoginUsername(profiles?.[0]?.username ?? "");
    if (username) {
      const authEmail = buildShopUserAuthEmail(username);
      console.info("[auth/resolve-login]", {
        inputKind: strategy.inputKind,
        resolved: true,
        resolvedBy: "unique_contact_email_profile",
        profileId: profiles?.[0]?.id ?? null,
        profileShopId: profiles?.[0]?.shop_id ?? null,
        normalizedAuthEmail: authEmail,
      });
      return NextResponse.json({
        inputKind: strategy.inputKind,
        authEmail,
        resolvedBy: "unique_contact_email_profile",
      });
    }
  }

  console.info("[auth/resolve-login]", {
    inputKind: strategy.inputKind,
    resolved: false,
    reason: (profiles ?? []).length > 1 ? "ambiguous_contact_email" : "no_staff_contact_profile",
  });

  return NextResponse.json({
    inputKind: strategy.inputKind,
    authEmail: strategy.authEmail,
    resolvedBy: "email_auth_identity",
  });
}
