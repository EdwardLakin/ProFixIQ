import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeInternalRedirect } from "@/features/auth/lib/safeRedirect";

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

type Body = {
  email?: string;
  redirect?: string | null;
};

function buildRedirectPath(input: string | null | undefined): string {
  return safeInternalRedirect(input, "/auth/reset", [
    "/auth/reset",
    "/auth/set-password",
  ]);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const redirectPath = buildRedirectPath(body?.redirect);
    const redirectTo = `${getBaseUrl()}${redirectPath}`;

    const supabase = createClient(
      mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
      mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    );

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Reset email sent.",
      redirectTo,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send reset email.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
