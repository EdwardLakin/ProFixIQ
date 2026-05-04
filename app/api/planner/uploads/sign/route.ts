// app/api/planner/uploads/sign/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type Body = {
  paths?: string[];   // ["shopId/userId/file.png", ...]
  expiresIn?: number; // seconds
};

function isSafeStoragePath(path: string, shopId: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (path.startsWith("/")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("//")) return false;

  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return false;
  }

  const hasTraversalSegment = (candidate: string) =>
    candidate
      .split("/")
      .some((segment) => segment === ".." || segment.trim().toLowerCase() === "%2e%2e");

  if (hasTraversalSegment(path) || hasTraversalSegment(decodedPath)) return false;

  return path.startsWith(`${shopId}/`);
}

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const paths = Array.isArray(body?.paths) ? body!.paths : [];
  if (paths.length === 0) return NextResponse.json({ error: "paths required" }, { status: 400 });

  const expiresIn = Number.isFinite(body?.expiresIn) ? Math.max(60, Number(body!.expiresIn)) : 60 * 60; // default 1h
  const hasOutOfScopePath = paths.some((path) => typeof path !== "string" || !isSafeStoragePath(path, shopId));
  if (hasOutOfScopePath) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signed, error } = await supabaseAdmin.storage
    .from("planner_uploads")
    .createSignedUrls(paths, expiresIn);

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "Failed to sign URLs" }, { status: 500 });
  }

  return NextResponse.json({
    signed: signed.map((row, i) => ({
      path: paths[i],
      url: row.signedUrl,
      error: row.error ?? null,
    })),
  });
}
