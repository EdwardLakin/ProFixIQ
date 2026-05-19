"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";

type DB = { public: { Functions: {
  accept_property_portal_invite: {
    Args: { p_raw_token: string };
    Returns: {
      ok: boolean;
      code: string;
      message: string;
    };
  };
} } };

const client = () => createServerSupabaseRSC() as unknown as SupabaseClient<DB>;

function acceptUrl(token: string, status: string) {
  return `/portal/property/invite/accept?token=${encodeURIComponent(token)}&status=${encodeURIComponent(status)}`;
}

function mapRpcCodeToStatus(code: string | null | undefined): "invite-invalid" | "invite-expired" | "invite-email-mismatch" | "invite-error" {
  switch ((code ?? "").toLowerCase()) {
    case "invite_invalid":
    case "invite-not-found":
    case "invalid_token":
      return "invite-invalid";
    case "invite_expired":
    case "invite-not-pending":
    case "invite-already-used":
      return "invite-expired";
    case "invite_email_mismatch":
    case "email_mismatch":
      return "invite-email-mismatch";
    default:
      return "invite-error";
  }
}

export async function getPropertyPortalInvitePreview(token: string) {
  const clean = token.trim();
  if (!clean) return { error: "Missing invite token." as const };

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "You must sign in to accept this invite." as const };

  return {
    ready: true as const,
    message: "Details will be confirmed securely after acceptance.",
  };
}

export async function acceptPropertyPortalInvite(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  if (!token) redirect("/portal/property/invite/accept?status=invite-invalid");

  const supabase = client();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/portal/property/invite/accept?token=${encodeURIComponent(token)}`)}`);

  const rpcRes = await supabase.rpc("accept_property_portal_invite", { p_raw_token: token });

  if (rpcRes.error) {
    redirect(acceptUrl(token, "invite-error"));
  }

  const result = rpcRes.data;
  if (!result?.ok) {
    redirect(acceptUrl(token, mapRpcCodeToStatus(result?.code)));
  }

  revalidatePath("/portal/property/member");
  redirect("/portal/property/member?status=invite-accepted");
}
