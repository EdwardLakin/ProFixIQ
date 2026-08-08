import "server-only";

import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";
import {
  isDefaultOpsOperatorEmail,
  normalizeOpsOperatorEmail,
} from "@/features/ops/lib/operatorAccess";

type OpsProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "email" | "full_name" | "role" | "agent_role" | "shop_id"
>;

export function isOpsOperatorEmail(value: string | null | undefined): boolean {
  return isDefaultOpsOperatorEmail(value);
}

export async function resolveOpsOperatorAccess() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, agent_role, shop_id")
    .eq("id", user.id)
    .maybeSingle<OpsProfile>();

  if (profileError) {
    console.error("ops operator profile lookup failed", profileError);
  }

  const operatorEmail = normalizeOpsOperatorEmail(user.email);
  if (!isOpsOperatorEmail(operatorEmail)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
    profile: profile ?? null,
    operatorEmail,
  };
}

export async function requireOpsOperatorApiAccess() {
  return resolveOpsOperatorAccess();
}

export async function requireOpsOperatorPageAccess() {
  const access = await resolveOpsOperatorAccess();
  if (!access.ok) {
    if (access.response.status === 401) {
      redirect("/sign-in?redirect=/ops");
    }
    notFound();
  }
  return access;
}
