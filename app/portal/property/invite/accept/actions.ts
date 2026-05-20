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
      success?: boolean;
      ok?: boolean;
      code?: string;
      message?: string;
      invite_id?: string;
      member_id?: string;
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

function mapRpcMessageToStatus(message: string | null | undefined): "invite-invalid" | "invite-expired" | "invite-email-mismatch" | "invite-error" {
  const lower = (message ?? "").toLowerCase();
  if (lower.includes("expired") || lower.includes("already handled")) return "invite-expired";
  if (lower.includes("does not match")) return "invite-email-mismatch";
  if (lower.includes("authentication required")) return "invite-error";
  if (lower) return "invite-invalid";
  return "invite-error";
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
    console.warn("accept_property_portal_invite rpc error", {
      message: rpcRes.error.message,
      userId: user.id,
      tokenPresent: true,
    });
    redirect(acceptUrl(token, "invite-error"));
  }

  const result = rpcRes.data;
  const isSuccess = result?.success === true || result?.ok === true;
  if (!isSuccess) {
    const statusFromCode = result?.code ? mapRpcCodeToStatus(result.code) : null;
    const status = statusFromCode ?? mapRpcMessageToStatus(result?.message);
    redirect(acceptUrl(token, status));
  }

  revalidatePath("/portal/property/member");
  redirect("/portal/property/member?status=invite-accepted");
}
