"use server";

import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  profiles: { Row: { id: string; email: string | null } };
  property_members: {
    Row: { id: string };
    Insert: { shop_id: string; user_id: string; role: string; portfolio_id?: string | null; property_id?: string | null; unit_id?: string | null };
  };
  property_portal_invites: {
    Row: { id: string; shop_id: string; invited_email: string; invited_name: string | null; role: string; portfolio_id: string | null; property_id: string | null; unit_id: string | null; status: string; expires_at: string };
  };
  property_portfolios: { Row: { id: string; name: string | null } };
  property_properties: { Row: { id: string; name: string | null } };
  property_units: { Row: { id: string; unit_label: string | null } };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

function hashToken(token: string) { return createHash("sha256").update(token, "utf8").digest("hex"); }
function err(token: string, msg: string) { return `/portal/property/invite/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent(msg)}`; }

export async function getPropertyPortalInvitePreview(token: string) {
  const clean = token.trim();
  if (!clean) return { error: "Missing invite token." as const };

  const supabase = client();
  const tokenHash = hashToken(clean);
  const { data, error } = await supabase
    .from("property_portal_invites")
    .select("id,shop_id,invited_email,invited_name,role,portfolio_id,property_id,unit_id,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return { error: "Invite acceptance is currently blocked by access policy. Step 22D must add a controlled invite-acceptance policy/RPC before runtime acceptance can proceed." as const };
  }
  if (!data) return { error: "Invite not found." as const };
  if (data.status !== "pending") return { error: "Invite is no longer pending." as const };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { error: "Invite has expired." as const };

  const [portfolio, property, unit] = await Promise.all([
    data.portfolio_id ? supabase.from("property_portfolios").select("id,name").eq("id", data.portfolio_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    data.property_id ? supabase.from("property_properties").select("id,name").eq("id", data.property_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    data.unit_id ? supabase.from("property_units").select("id,unit_label").eq("id", data.unit_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  return { invite: data, labels: { portfolio: portfolio.data?.name ?? null, property: property.data?.name ?? null, unit: unit.data?.unit_label ?? null } };
}

export async function acceptPropertyPortalInvite(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  if (!token) redirect("/portal/property/invite/accept?error=" + encodeURIComponent("Missing invite token."));

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const tokenHash = hashToken(token);
  const inviteRes = await supabase.from("property_portal_invites").select("id,shop_id,invited_email,role,portfolio_id,property_id,unit_id,status,expires_at").eq("token_hash", tokenHash).maybeSingle();
  if (inviteRes.error) redirect(err(token, "Invite acceptance is currently blocked by access policy. Step 22D must add a controlled invite-acceptance policy/RPC before runtime acceptance can proceed."));

  const invite = inviteRes.data;
  if (!invite) redirect(err(token, "Invite not found."));
  if (invite.status !== "pending") redirect(err(token, "Invite is no longer pending."));
  if (new Date(invite.expires_at).getTime() <= Date.now()) redirect(err(token, "Invite has expired."));

  const [profileRes, dupeRes] = await Promise.all([
    supabase.from("profiles").select("id,email").eq("id", user.id).maybeSingle(),
    supabase.from("property_members").select("id").eq("shop_id", invite.shop_id).eq("user_id", user.id).eq("role", invite.role).is("portfolio_id", invite.portfolio_id).is("property_id", invite.property_id).is("unit_id", invite.unit_id).maybeSingle(),
  ]);

  const actorEmail = profileRes.data?.email?.trim().toLowerCase() ?? user.email?.trim().toLowerCase() ?? null;
  if (actorEmail && actorEmail !== invite.invited_email.trim().toLowerCase()) redirect(err(token, "Authenticated email does not match the invited email."));

  if (!dupeRes.data) {
    const { error: insertError } = await supabase.from("property_members").insert({ shop_id: invite.shop_id, user_id: user.id, role: invite.role, portfolio_id: invite.portfolio_id, property_id: invite.property_id, unit_id: invite.unit_id });
    if (insertError) redirect(err(token, insertError.message));
  }

  const { error: updateError } = await supabase.from("property_portal_invites").update({ status: "accepted", accepted_by_profile_id: user.id, accepted_at: new Date().toISOString() }).eq("id", invite.id).eq("status", "pending");
  if (updateError) redirect(err(token, updateError.message));

  revalidatePath("/portal/property/member");
  redirect("/portal/property/member?status=invite-accepted");
}
