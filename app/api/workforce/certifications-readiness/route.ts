import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const DAY_MS = 1000 * 60 * 60 * 24;
const EXPIRING_SOON_DAYS = 30;

type CertStatus = "expired" | "expiring_soon" | "active";

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;

  const [{ data: certs, error: certErr }, { data: people, error: peopleErr }] = await Promise.all([
    admin
      .from("staff_certifications")
      .select("id, user_id, cert_name, expiry_date, status")
      .eq("shop_id", shopId),
    admin.from("profiles").select("id, full_name, email").eq("shop_id", shopId),
  ]);

  if (certErr) return NextResponse.json({ error: certErr.message }, { status: 500 });
  if (peopleErr) return NextResponse.json({ error: peopleErr.message }, { status: 500 });

  const profileById = new Map((people ?? []).map((person) => [person.id, person]));
  const now = Date.now();
  const expiringSoonCutoff = now + EXPIRING_SOON_DAYS * DAY_MS;

  const items = (certs ?? []).map((cert) => {
    let lifecycle: CertStatus = "active";
    const expiresTs = cert.expiry_date ? new Date(cert.expiry_date).getTime() : null;
    const normalizedStatus = String(cert.status ?? "").toLowerCase();

    if (normalizedStatus === "expired" || (expiresTs !== null && Number.isFinite(expiresTs) && expiresTs < now)) {
      lifecycle = "expired";
    } else if (expiresTs !== null && Number.isFinite(expiresTs) && expiresTs <= expiringSoonCutoff) {
      lifecycle = "expiring_soon";
    }

    const person = profileById.get(cert.user_id);
    return {
      personId: cert.user_id,
      personName: person?.full_name ?? person?.email ?? "Unknown person",
      certificationId: cert.id,
      name: cert.cert_name,
      expiresAt: cert.expiry_date,
      status: lifecycle,
      href: `/dashboard/workforce/people/${cert.user_id}?focus=certifications`,
    };
  });

  const peopleAtRiskSet = new Set(items.filter((item) => item.status !== "active").map((item) => item.personId));

  const summary = {
    expired: items.filter((item) => item.status === "expired").length,
    expiringSoon: items.filter((item) => item.status === "expiring_soon").length,
    active: items.filter((item) => item.status === "active").length,
    peopleAtRisk: peopleAtRiskSet.size,
  };

  return NextResponse.json({ summary, items, generatedAt: new Date().toISOString() });
}
