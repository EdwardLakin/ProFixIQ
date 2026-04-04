import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    return process.env.NEXT_PUBLIC_SITE_URL.trim().replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL?.trim()) {
    return `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

function buildRedirectTo(req: Request): string {
  const url = new URL(req.url);
  const requestedRedirect = url.searchParams.get("redirect")?.trim() ?? "";
  const baseUrl = getBaseUrl();

  if (!requestedRedirect) {
    return `${baseUrl}/auth/reset`;
  }

  return `${baseUrl}/auth/reset?redirect=${encodeURIComponent(requestedRedirect)}`;
}

type Body = {
  email?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const supabase = createClient(
      mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
      mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    );

    const redirectTo = buildRedirectTo(req);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Reset email sent.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send reset email.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
