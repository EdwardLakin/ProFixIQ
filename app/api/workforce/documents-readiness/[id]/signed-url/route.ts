import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const SIGNED_TTL_SECONDS = 60 * 5;

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const admin = createAdminSupabase();

  const { data: doc, error } = await admin
    .from("employee_documents")
    .select("id, shop_id, file_path, bucket_id")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!doc || doc.shop_id !== access.profile.shop_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bucket = doc.bucket_id || "employee_docs";
  const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUrl(doc.file_path, SIGNED_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? "Unable to create signed url" }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: signed.signedUrl, expiresIn: SIGNED_TTL_SECONDS });
}
