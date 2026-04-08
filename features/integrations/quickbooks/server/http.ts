import { getQuickBooksApiBaseUrl, getQuickBooksClientId, getQuickBooksClientSecret, getQuickBooksTokenUrl } from "./env";
import type { DB, QuickBooksConnectionRow } from "../types";
import type { SupabaseClient } from "@supabase/supabase-js";

type TokenExchangeResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
};

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function addSecondsToNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function exchangeQuickBooksCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<TokenExchangeResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(getQuickBooksTokenUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildBasicAuthHeader(
        getQuickBooksClientId(),
        getQuickBooksClientSecret(),
      ),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as TokenExchangeResponse & {
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(
      json.error_description || json.error || "Failed to exchange QuickBooks code.",
    );
  }

  return json;
}

export async function refreshQuickBooksTokens(
  supabase: SupabaseClient<DB>,
  connection: QuickBooksConnectionRow,
): Promise<QuickBooksConnectionRow> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token,
  });

  const res = await fetch(getQuickBooksTokenUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildBasicAuthHeader(
        getQuickBooksClientId(),
        getQuickBooksClientSecret(),
      ),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as TokenExchangeResponse & {
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(
      json.error_description || json.error || "Failed to refresh QuickBooks token.",
    );
  }

  const updatePayload: DB["public"]["Tables"]["quickbooks_connections"]["Update"] = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    access_token_expires_at: addSecondsToNow(json.expires_in),
    refresh_token_expires_at:
      typeof json.x_refresh_token_expires_in === "number"
        ? addSecondsToNow(json.x_refresh_token_expires_in)
        : connection.refresh_token_expires_at,
    token_scope: json.scope
      ? json.scope.split(" ").map((item) => item.trim()).filter(Boolean)
      : connection.token_scope,
    token_type: json.token_type ?? connection.token_type,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("quickbooks_connections")
    .update(updatePayload)
    .eq("id", connection.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to persist refreshed QuickBooks token.");
  }

  return data;
}

export async function ensureActiveQuickBooksConnection(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<QuickBooksConnectionRow> {
  const { data, error } = await supabase
    .from("quickbooks_connections")
    .select("*")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("QuickBooks is not connected for this shop.");
  }

  const expiresAt = new Date(data.access_token_expires_at).getTime();
  const now = Date.now();

  if (!Number.isFinite(expiresAt) || expiresAt - now <= 60_000) {
    return refreshQuickBooksTokens(supabase, data);
  }

  return data;
}

export async function quickBooksFetch<T>(
  connection: QuickBooksConnectionRow,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${getQuickBooksApiBaseUrl()}/v3/company/${connection.realm_id}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${connection.access_token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as T & {
    Fault?: {
      Error?: Array<{ Message?: string; Detail?: string }>;
    };
  };

  if (!res.ok) {
    const qbMessage =
      json?.Fault?.Error?.[0]?.Detail ||
      json?.Fault?.Error?.[0]?.Message ||
      "QuickBooks API request failed.";
    throw new Error(qbMessage);
  }

  return json;
}