import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import {
  purgeOrphanDemoUploads,
  type PurgeClient,
} from "@/features/integrations/shopBoost/purgeOrphanDemoUploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Removes staged-but-never-activated Instant Shop Analysis uploads. Deletion is
// opt-in: a plain call is a dry run that only reports what would be removed;
// pass ?apply=1 to delete. A run scans a bounded number of pages; when the
// response has a nextPage, call again with ?page=<nextPage> to continue. Intentionally not scheduled in vercel.json until a
// dry run has been reviewed.

function authorize(req: Request) {
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/demo/purge-orphan-uploads",
    bearerEnvSecretName: "CRON_SECRET",
  });
}

async function handle(req: Request) {
  const gate = authorize(req);
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const apply = searchParams.get("apply") === "1";
  const pageParam = Number.parseInt(searchParams.get("page") ?? "0", 10);
  const startPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 0;

  try {
    const result = await purgeOrphanDemoUploads({
      admin: createAdminSupabase() as unknown as PurgeClient,
      apply,
      startPage,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[internal/demo/purge-orphan-uploads] failed", error);
    return NextResponse.json({ error: "Failed to purge orphaned demo uploads" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
