"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MEMBER_ROLES = new Set(["manager", "dispatcher", "driver"]);

function field(formData: FormData, key: string, maxLength: number): string {
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, maxLength);
}

function safeActionError(message: string): string {
  const knownMessages = [
    "Fleet management access required",
    "Fleet not found",
    "Fleet name is required",
    "Fleet name is too long",
    "Enter a valid contact email",
    "You cannot change your own Fleet access",
    "Fleet member not found",
    "Protected Fleet owners must be managed by support",
    "Every Fleet workspace must keep at least one manager",
    "Reassign active assets before removing this driver",
    "Select a valid Fleet role",
  ];
  return (
    knownMessages.find((candidate) => message.includes(candidate)) ??
    "Fleet settings could not be updated."
  );
}

function settingsHref(
  fleetId: string,
  result: { saved?: string; error?: string },
): string {
  const search = new URLSearchParams({ fleetId });
  if (result.saved) search.set("saved", result.saved);
  if (result.error) search.set("error", result.error);
  return `/settings?${search.toString()}`;
}

function validFleetId(formData: FormData): string | null {
  const fleetId = field(formData, "fleetId", 36);
  return UUID.test(fleetId) ? fleetId : null;
}

export async function updateFleetWorkspace(formData: FormData): Promise<void> {
  const fleetId = validFleetId(formData);
  if (!fleetId) redirect("/settings?error=Valid+Fleet+workspace+required");

  const name = field(formData, "name", 120);
  const contactEmail = field(formData, "contactEmail", 254).toLowerCase();
  if (!name)
    redirect(settingsHref(fleetId, { error: "Fleet name is required" }));
  if (contactEmail && !EMAIL.test(contactEmail)) {
    redirect(settingsHref(fleetId, { error: "Enter a valid contact email" }));
  }

  const supabase = createServerSupabaseRSC();
  const { error } = await supabase.rpc("manage_fleet_workspace", {
    p_action: "update_workspace",
    p_fleet_id: fleetId,
    p_name: name,
    p_contact_name: field(formData, "contactName", 120),
    p_contact_email: contactEmail,
    p_contact_phone: field(formData, "contactPhone", 40),
    p_notes: field(formData, "notes", 2000),
  });

  if (error) {
    redirect(settingsHref(fleetId, { error: safeActionError(error.message) }));
  }

  revalidatePath("/portal/fleet/settings");
  redirect(settingsHref(fleetId, { saved: "workspace" }));
}

export async function updateFleetMemberRole(formData: FormData): Promise<void> {
  const fleetId = validFleetId(formData);
  const memberUserId = field(formData, "memberUserId", 36);
  const role = field(formData, "role", 24);
  if (!fleetId || !UUID.test(memberUserId) || !MEMBER_ROLES.has(role)) {
    redirect("/settings?error=Valid+Fleet+member+and+role+required");
  }

  const supabase = createServerSupabaseRSC();
  const { error } = await supabase.rpc("manage_fleet_workspace", {
    p_action: "update_member_role",
    p_fleet_id: fleetId,
    p_member_user_id: memberUserId,
    p_role: role,
  });

  if (error) {
    redirect(settingsHref(fleetId, { error: safeActionError(error.message) }));
  }

  revalidatePath("/portal/fleet/settings");
  redirect(settingsHref(fleetId, { saved: "member" }));
}

export async function removeFleetMember(formData: FormData): Promise<void> {
  const fleetId = validFleetId(formData);
  const memberUserId = field(formData, "memberUserId", 36);
  if (!fleetId || !UUID.test(memberUserId)) {
    redirect("/settings?error=Valid+Fleet+member+required");
  }

  const supabase = createServerSupabaseRSC();
  const { error } = await supabase.rpc("manage_fleet_workspace", {
    p_action: "remove_member",
    p_fleet_id: fleetId,
    p_member_user_id: memberUserId,
  });

  if (error) {
    redirect(settingsHref(fleetId, { error: safeActionError(error.message) }));
  }

  revalidatePath("/portal/fleet/settings");
  redirect(settingsHref(fleetId, { saved: "removed" }));
}
