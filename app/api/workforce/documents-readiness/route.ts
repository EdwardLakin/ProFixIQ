import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { classifyDocumentExpiration } from "@/features/shared/lib/workforce/documentReadiness";
import { workforceDisplayName } from "@/features/workforce/lib/roster";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";

const DAY_MS = 1000 * 60 * 60 * 24;
const RECENT_WINDOW_DAYS = 14;
const EXPIRING_SOON_DAYS = 30;

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;

  const [
    { data, error },
    { data: shop, error: shopError },
  ] = await Promise.all([
    admin
      .from("employee_documents")
      .select("id, doc_type, status, uploaded_at, expires_at, user_id")
      .eq("shop_id", shopId)
      .order("uploaded_at", { ascending: false }),
    admin
      .from("shops")
      .select("timezone")
      .eq("id", shopId)
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (shopError) return NextResponse.json({ error: shopError.message }, { status: 500 });

  const userIds = Array.from(new Set((data ?? []).map((row) => row.user_id).filter(Boolean)));
  const { data: profiles, error: profilesError } =
    userIds.length === 0
      ? { data: [], error: null }
      : await admin
          .from("profiles")
          .select("id, full_name, username, email")
          .in("id", userIds)
          .eq("shop_id", shopId);
  if (profilesError) {
    return NextResponse.json(
      { error: profilesError.message },
      { status: 500 },
    );
  }

  const profileById = new Map((profiles ?? []).map((row) => [row.id, row]));
  const now = Date.now();
  const recentCutoff = now - RECENT_WINDOW_DAYS * DAY_MS;
  const todayDateKey = getShopScheduleDateContext(
    new Date(now),
    shop?.timezone,
  ).dateKey;

  const documents = (data ?? []).map((row) => {
    const profile = profileById.get(row.user_id);
    const normalizedStatus = String(row.status ?? "").toLowerCase();
    const uploadedTs = row.uploaded_at
      ? new Date(row.uploaded_at).getTime()
      : Number.NaN;
    const expirationState =
      normalizedStatus === "expired"
        ? "expired"
        : classifyDocumentExpiration({
            expiresAt: row.expires_at,
            todayDateKey,
            warningDays: EXPIRING_SOON_DAYS,
          });
    return {
      id: row.id,
      docType: row.doc_type,
      status: row.status,
      uploadedAt: row.uploaded_at,
      expiresAt: row.expires_at,
      userId: row.user_id,
      personName: workforceDisplayName(profile),
      personEmail: profile?.email ?? null,
      viewPath: `/api/workforce/documents-readiness/${row.id}/signed-url`,
      needsReview: ["received", "pending", "review", "needs_review"].includes(
        normalizedStatus,
      ),
      isRecent: Number.isFinite(uploadedTs) && uploadedTs >= recentCutoff,
      expirationState,
    };
  });

  const summary = documents.reduce(
    (acc, doc) => {
      acc.total += 1;
      if (doc.isRecent) acc.recent += 1;
      if (doc.needsReview) acc.needsReview += 1;
      if (doc.expirationState === "expired") acc.expired += 1;
      else if (doc.expirationState === "expiring_soon") acc.expiringSoon += 1;
      return acc;
    },
    { total: 0, recent: 0, needsReview: 0, expired: 0, expiringSoon: 0 },
  );

  return NextResponse.json({ summary, documents, generatedAt: new Date().toISOString() });
}
