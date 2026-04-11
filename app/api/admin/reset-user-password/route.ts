// app/api/admin/reset-user-password/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export async function POST(req: Request) {
  const authClient = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user: callerUser },
    error: callerAuthError,
  } = await authClient.auth.getUser();

  if (callerAuthError || !callerUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile, error: callerProfileError } = await authClient
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", callerUser.id)
    .maybeSingle();

  if (callerProfileError || !callerProfile?.shop_id) {
    return NextResponse.json({ error: "Unable to resolve caller profile" }, { status: 400 });
  }

  const actor = getActorCapabilities({ role: callerProfile.role });
  if (!actor.isKnownRole || !actor.canManageUsers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { username, password } = (await req.json()) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const supabase = createClient<Database>(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  // find user by username in profiles scoped to the caller shop
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, shop_id")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (profile.shop_id !== callerProfile.shop_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(profile.id, {
    password,
  });
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // optionally re-set must_change_password on profile
  await supabase
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", profile.id);

  return NextResponse.json({ ok: true });
}
