import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const DAY_MS = 1000 * 60 * 60 * 24;
const RECENT_WINDOW_DAYS = 14;
const EXPIRING_SOON_DAYS = 30;

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;

  const { data, error } = await admin
    .from("employee_documents")
    .select("id, doc_type, status, uploaded_at, expires_at, user_id")
    .eq("shop_id", shopId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = Array.from(new Set((data ?? []).map((row) => row.user_id).filter(Boolean)));
  const { data: profiles } = userIds.length === 0
    ? { data: [] }
    : await admin.from("profiles").select("id, full_name, email").in("id", userIds).eq("shop_id", shopId);

  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * DAY_MS;
  const expiringSoonCutoff = now + EXPIRING_SOON_DAYS * DAY_MS;

  const documents = (data ?? []).map((row) => {
    const profile = profileById.get(row.user_id);
    return {
      id: row.id,
      docType: row.doc_type,
      status: row.status,
      uploadedAt: row.uploaded_at,
      expiresAt: row.expires_at,
      userId: row.user_id,
      personName: profile?.full_name ?? null,
      personEmail: profile?.email ?? null,
      viewPath: `/api/workforce/documents-readiness/${row.id}/signed-url`,
    };
  });

  const summary = documents.reduce(
    (acc, doc) => {
      const uploadedTs = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : 0;
      const expiresTs = doc.expiresAt ? new Date(doc.expiresAt).getTime() : null;
      const status = String(doc.status ?? "").toLowerCase();

      acc.total += 1;
      if (uploadedTs >= recentCutoff) acc.recent += 1;
      if (["received", "pending", "review", "needs_review"].includes(status)) acc.needsReview += 1;
      if (expiresTs !== null && Number.isFinite(expiresTs)) {
        if (expiresTs < now) acc.expired += 1;
        else if (expiresTs <= expiringSoonCutoff) acc.expiringSoon += 1;
      }
      return acc;
    },
    { total: 0, recent: 0, needsReview: 0, expired: 0, expiringSoon: 0 },
  );

  return NextResponse.json({ summary, documents, generatedAt: new Date().toISOString() });
}
