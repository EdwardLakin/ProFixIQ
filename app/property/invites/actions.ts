"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null }; Insert: never; Update: never; Relationships: [] };
  property_portfolios: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_properties: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_units: { Row: { id: string; shop_id: string; property_id: string; unit_label: string | null }; Insert: never; Update: never; Relationships: [] };
  property_portal_invites: {
    Row: { id: string; shop_id: string; invited_email: string; invited_name: string | null; role: string; portfolio_id: string | null; property_id: string | null; unit_id: string | null; status: string; expires_at: string; created_at: string; accepted_at: string | null };
    Insert: { shop_id: string; invited_email: string; invited_name?: string | null; role: string; portfolio_id?: string | null; property_id?: string | null; unit_id?: string | null; token_hash: string; expires_at: string; created_by_profile_id: string };
    Update: never;
    Relationships: [];
  };
} } };

const roles = ["property_manager", "owner_approver", "tenant_requester", "viewer"] as const;
const roleSet = new Set<string>(roles);
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export type InviteCreateActionState = {
  status: "idle" | "validation-error" | "invite-created";
  message?: string;
  inviteLink?: string;
  invitedEmail?: string;
  expiresAt?: string;
};

export const initialInviteCreateActionState: InviteCreateActionState = { status: "idle" };

export async function createPropertyPortalInvite(
  _prevState: InviteCreateActionState,
  formData: FormData,
): Promise<InviteCreateActionState> {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "validation-error", message: "You must be signed in to create invites." };
  }

  const { data: me } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!me?.shop_id) {
    return { status: "validation-error", message: "No shop scope on current profile." };
  }
  const currentShopId = me.shop_id;

  const invitedEmail = String(formData.get("invited_email") || "").trim().toLowerCase();
  const invitedName = String(formData.get("invited_name") || "").trim() || null;
  const role = String(formData.get("role") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim() || null;
  const propertyId = String(formData.get("property_id") || "").trim() || null;
  const unitId = String(formData.get("unit_id") || "").trim() || null;
  const expiresInDays = Number.parseInt(String(formData.get("expires_in_days") || "7").trim(), 10);

  if (!invitedEmail) return { status: "validation-error", message: "Invited email is required." };
  if (!roleSet.has(role)) return { status: "validation-error", message: "Invalid role." };
  if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    return { status: "validation-error", message: "Expires in days must be between 1 and 30." };
  }
  if (role !== "property_manager" && !portfolioId && !propertyId && !unitId) {
    return { status: "validation-error", message: "Scope required unless role is property_manager." };
  }

  if (portfolioId) {
    const { data } = await supabase.from("property_portfolios").select("id,shop_id").eq("id", portfolioId).maybeSingle();
    if (!data || data.shop_id !== currentShopId) return { status: "validation-error", message: "Invalid portfolio scope." };
  }

  if (propertyId) {
    const { data } = await supabase.from("property_properties").select("id,shop_id").eq("id", propertyId).maybeSingle();
    if (!data || data.shop_id !== currentShopId) return { status: "validation-error", message: "Invalid property scope." };
  }

  if (unitId) {
    const { data } = await supabase.from("property_units").select("id,shop_id,property_id").eq("id", unitId).maybeSingle();
    if (!data || data.shop_id !== currentShopId) return { status: "validation-error", message: "Invalid unit scope." };
    if (propertyId && data.property_id !== propertyId) return { status: "validation-error", message: "Unit does not belong to property." };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("property_portal_invites").insert({
    shop_id: currentShopId,
    invited_email: invitedEmail,
    invited_name: invitedName,
    role,
    portfolio_id: portfolioId,
    property_id: propertyId,
    unit_id: unitId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by_profile_id: user.id,
  });

  if (error) {
    return { status: "validation-error", message: error.message };
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  const inviteLink = `${origin}/portal/property/invite/accept?token=${rawToken}`;

  revalidatePath("/property/invites");
  revalidatePath("/property");

  return {
    status: "invite-created",
    inviteLink,
    invitedEmail,
    expiresAt,
  };
}
