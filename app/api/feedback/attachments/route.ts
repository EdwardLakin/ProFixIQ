import { NextRequest, NextResponse } from "next/server";

import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type Body = { paths?: string[] };

export async function POST(req: NextRequest) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  const paths = Array.isArray(body?.paths)
    ? [...new Set(body.paths.filter((path): path is string =>
        typeof path === "string" && path.trim().length > 0,
      ))].slice(0, 40)
    : [];

  if (paths.length === 0) {
    return NextResponse.json({ attachments: [] });
  }

  const { data, error } = await createAdminSupabase().storage
    .from("agent_uploads")
    .createSignedUrls(paths, 60 * 60);

  if (error) {
    console.error("feedback attachment signing failed", error);
    return NextResponse.json(
      { error: "Could not load feedback attachments" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    attachments: (data ?? []).flatMap((row, index) => {
      const url = row.signedUrl;
      if (!url) return [];
      return [{ path: paths[index], url }];
    }),
  });
}
