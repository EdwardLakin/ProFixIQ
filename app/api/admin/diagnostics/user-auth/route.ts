export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  buildShopUserAuthEmail,
  getAuthIdentifierStrategy,
  normalizeLoginUsername,
} from "@/features/users/lib/username";

type Body = { identifier?: string | null };
type AuthUserSummary = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createAdminSupabase>,
  email: string,
): Promise<AuthUserSummary | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageUsers",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: "Admin profile is missing shop scope." }, { status: 403 });
  }

  const { identifier = "" } = (await req.json().catch(() => ({}))) as Body;
  const strategy = getAuthIdentifierStrategy(identifier ?? "");
  const normalizedUsername = normalizeLoginUsername(identifier ?? "");
  const supabase = createAdminSupabase();

  let profileQuery = supabase
    .from("profiles")
    .select("id, username, email, shop_id, role, completed_onboarding")
    .eq("shop_id", shopId)
    .limit(2);

  if (strategy.inputKind === "email") {
    profileQuery = profileQuery.ilike("email", strategy.authEmail);
  } else {
    profileQuery = profileQuery.ilike("username", normalizedUsername);
  }

  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profile = (profiles ?? []).length === 1 ? profiles?.[0] : null;
  const expectedAuthEmail = profile?.username
    ? buildShopUserAuthEmail(profile.username)
    : strategy.authEmail;
  const authUser = await findAuthUserByEmail(supabase, expectedAuthEmail);

  return NextResponse.json({
    inputKind: strategy.inputKind,
    expectedAuthEmail,
    profileMatchCount: profiles?.length ?? 0,
    profile: profile
      ? {
          id: profile.id,
          username: profile.username,
          contactEmail: profile.email,
          shopId: profile.shop_id,
          role: profile.role,
          completedOnboarding: profile.completed_onboarding,
        }
      : null,
    authUser: authUser
      ? {
          exists: true,
          id: authUser.id,
          emailMatchesExpected: authUser.email?.toLowerCase() === expectedAuthEmail.toLowerCase(),
          profileIdMatchesAuthUserId: profile?.id === authUser.id,
          profileShopMatchesAdminShop: profile?.shop_id === shopId,
          emailConfirmed: Boolean(authUser.email_confirmed_at ?? authUser.confirmed_at),
        }
      : {
          exists: false,
          emailMatchesExpected: false,
          profileIdMatchesAuthUserId: false,
          profileShopMatchesAdminShop: profile?.shop_id === shopId,
          emailConfirmed: false,
        },
  });
}
