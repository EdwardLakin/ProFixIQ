import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  composeActiveWorkforceRoster,
  workforceDisplayName,
} from "@/features/workforce/lib/roster";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";
import { addScheduleDateKeyDays } from "@/features/workforce/lib/scheduleValidation";

const EXPIRING_SOON_DAYS = 30;

type CertStatus = "expired" | "expiring_soon" | "active";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager"],
  });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;
  const canManagePeople =
    access.profile.role === "owner" || access.profile.role === "admin";

  const [
    { data: certs, error: certErr },
    { data: people, error: peopleErr },
    { data: workforceProfiles, error: workforceError },
    { data: shop, error: shopError },
  ] = await Promise.all([
    admin
      .from("staff_certifications")
      .select("id, user_id, cert_name, expiry_date, status")
      .eq("shop_id", shopId),
    admin
      .from("profiles")
      .select("id, full_name, username, email, role")
      .eq("shop_id", shopId),
    admin
      .from("people_workforce_profiles")
      .select("user_id, employment_status")
      .eq("shop_id", shopId),
    admin
      .from("shops")
      .select("timezone")
      .eq("id", shopId)
      .maybeSingle(),
  ]);

  if (certErr) return NextResponse.json({ error: certErr.message }, { status: 500 });
  if (peopleErr) return NextResponse.json({ error: peopleErr.message }, { status: 500 });
  if (workforceError) {
    return NextResponse.json({ error: workforceError.message }, { status: 500 });
  }
  if (shopError) {
    return NextResponse.json({ error: shopError.message }, { status: 500 });
  }

  const activeRoster = composeActiveWorkforceRoster({
    profiles: people ?? [],
    workforceProfiles: workforceProfiles ?? [],
  });
  const activeIds = new Set(activeRoster.map((person) => person.id));
  const profileById = new Map(
    (people ?? [])
      .filter((person) => activeIds.has(person.id))
      .map((person) => [person.id, person]),
  );
  const todayDateKey = getShopScheduleDateContext(
    new Date(),
    shop?.timezone,
  ).dateKey;
  const expiringSoonDateKey = addScheduleDateKeyDays(
    todayDateKey,
    EXPIRING_SOON_DAYS,
  );

  const items = (certs ?? [])
    .filter((cert) => activeIds.has(cert.user_id))
    .map((cert) => {
    let lifecycle: CertStatus = "active";
    const expiryDateKey =
      typeof cert.expiry_date === "string"
        ? cert.expiry_date.slice(0, 10)
        : null;
    const normalizedStatus = String(cert.status ?? "").toLowerCase();

    if (
      normalizedStatus === "expired" ||
      (expiryDateKey && expiryDateKey < todayDateKey)
    ) {
      lifecycle = "expired";
    } else if (
      expiryDateKey &&
      expiryDateKey <= expiringSoonDateKey
    ) {
      lifecycle = "expiring_soon";
    }

    const person = profileById.get(cert.user_id);
    return {
      personId: cert.user_id,
      personName: workforceDisplayName(person),
      certificationId: cert.id,
      name: cert.cert_name,
      expiresAt: cert.expiry_date,
      status: lifecycle,
      href: canManagePeople
        ? `/dashboard/workforce/people/${cert.user_id}?focus=certifications`
        : null,
    };
    });

  const peopleAtRiskSet = new Set(items.filter((item) => item.status !== "active").map((item) => item.personId));

  const summary = {
    expired: items.filter((item) => item.status === "expired").length,
    expiringSoon: items.filter((item) => item.status === "expiring_soon").length,
    active: items.filter((item) => item.status === "active").length,
    peopleAtRisk: peopleAtRiskSet.size,
  };

  return NextResponse.json({
    summary,
    items,
    permissions: { canManagePeople },
    generatedAt: new Date().toISOString(),
  });
}
