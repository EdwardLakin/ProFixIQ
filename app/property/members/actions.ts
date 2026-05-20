"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Tables: {
  profiles: { Row: { id: string; shop_id: string | null }; Insert: never; Update: never; Relationships: [] };
  property_portfolios: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_properties: { Row: { id: string; shop_id: string; name: string | null }; Insert: never; Update: never; Relationships: [] };
  property_units: { Row: { id: string; shop_id: string; property_id: string; unit_label: string | null }; Insert: never; Update: never; Relationships: [] };
  property_members: { Row: { id: string; shop_id: string; user_id: string; role: string; portfolio_id: string | null; property_id: string | null; unit_id: string | null; created_at: string | null }; Insert: { shop_id: string; user_id: string; role: string; portfolio_id?: string | null; property_id?: string | null; unit_id?: string | null }; Update: never; Relationships: [] };
} } };

const roles = ["property_manager", "owner_approver", "tenant_requester", "vendor", "viewer"] as const;
const roleSet = new Set<string>(roles);
const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

export async function createMember(formData: FormData) {
  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");
  const { data: me } = await supabase.from("profiles").select("id,shop_id").eq("id", user.id).maybeSingle();
  if (!me?.shop_id) redirect("/property/members?error=" + encodeURIComponent("No shop scope on current profile."));
  const shopId = me.shop_id;

  const userId = String(formData.get("user_id") || "").trim();
  const role = String(formData.get("role") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim() || null;
  const propertyId = String(formData.get("property_id") || "").trim() || null;
  const unitId = String(formData.get("unit_id") || "").trim() || null;

  if (!userId) redirect("/property/members?error=" + encodeURIComponent("User is required."));
  if (!roleSet.has(role)) redirect("/property/members?error=" + encodeURIComponent("Invalid role."));
  if (role !== "property_manager" && !portfolioId && !propertyId && !unitId) redirect("/property/members?error=" + encodeURIComponent("Scope required unless role is property_manager."));

  const { data: target } = await supabase.from("profiles").select("id,shop_id").eq("id", userId).maybeSingle();
  if (!target || target.shop_id !== shopId) redirect("/property/members?error=" + encodeURIComponent("Selected user is outside your shop scope."));

  if (portfolioId) {
    const { data } = await supabase.from("property_portfolios").select("id,shop_id").eq("id", portfolioId).maybeSingle();
    if (!data || data.shop_id !== shopId) redirect("/property/members?error=" + encodeURIComponent("Invalid portfolio scope."));
  }
  if (propertyId) {
    const { data } = await supabase.from("property_properties").select("id,shop_id").eq("id", propertyId).maybeSingle();
    if (!data || data.shop_id !== shopId) redirect("/property/members?error=" + encodeURIComponent("Invalid property scope."));
  }
  if (unitId) {
    const { data } = await supabase.from("property_units").select("id,shop_id,property_id").eq("id", unitId).maybeSingle();
    if (!data || data.shop_id !== shopId) redirect("/property/members?error=" + encodeURIComponent("Invalid unit scope."));
    if (propertyId && data.property_id !== propertyId) redirect("/property/members?error=" + encodeURIComponent("Unit does not belong to property."));
  }

  const { data: dupe } = await supabase.from("property_members").select("id").eq("shop_id", shopId).eq("user_id", userId).eq("role", role).is("portfolio_id", portfolioId).is("property_id", propertyId).is("unit_id", unitId).maybeSingle();
  if (dupe) redirect("/property/members?status=member-exists");

  const { error } = await supabase.from("property_members").insert({ shop_id: shopId, user_id: userId, role, portfolio_id: portfolioId, property_id: propertyId, unit_id: unitId });
  if (error) redirect("/property/members?error=" + encodeURIComponent(error.message));

  revalidatePath("/property/members");
  revalidatePath("/property");
  redirect("/property/members?status=member-created");
}
