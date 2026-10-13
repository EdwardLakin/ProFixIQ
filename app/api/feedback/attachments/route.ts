import { NextRequest, NextResponse } from "next/server";

import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type Body = { paths?: string[] };

const SIGNING_BATCH_SIZE = 40;

export async function POST(req: NextRequest) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const paths = Array.isArray(body?.paths)
    ? [...new Set(
        body.paths.filter(
          (path): path is string =>
            typeof path === "string" && path.trim().length > 0,
        ),
      )]
    : [];

  if (paths.length === 0) {
    return NextResponse.json({ attachments: [] });
  }

  const storage = createAdminSupabase().storage.from("agent_uploads");
  const attachments: Array<{ path: string; url: string }> = [];

  for (let index = 0; index < paths.length; index += SIGNING_BATCH_SIZE) {
    const batch = paths.slice(index, index + SIGNING_BATCH_SIZE);
    const { data, error } = await storage.createSignedUrls(batch, 60 * 60);

    if (error) {
      console.error("feedback attachment signing failed", { index, error });
      return NextResponse.json(
        { error: "Could not load feedback attachments" },
        { status: 500 },
      );
    }

    for (const [batchIndex, row] of (data ?? []).entries()) {
      if (!row.signedUrl) continue;
      attachments.push({ path: batch[batchIndex], url: row.signedUrl });
    }
  }

  return NextResponse.json({ attachments });
}
