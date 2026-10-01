import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";
import {
  pickInspectionLicenseNumber,
  shopStationLocation,
  shopStationName,
} from "@/features/inspections/lib/certificationDefaults";

// Values for the certification block of an imported fleet form, so the
// technician confirms them instead of typing them: station name and location
// come from the shop, the licence number from the signing technician's own
// workforce certifications. Scoped to the caller's shop and to the caller.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canRunInspections",
  });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const shopId = access.profile.shop_id;
  const userId = access.profile.id;

  const [shopResult, certResult] = await Promise.all([
    admin
      .from("shops")
      .select("name, shop_name, business_name, address, city, province, postal_code, timezone")
      .eq("id", shopId)
      .maybeSingle(),
    admin
      .from("staff_certifications")
      .select("cert_type, cert_name, cert_number, issuing_body, expiry_date, status")
      .eq("shop_id", shopId)
      .eq("user_id", userId),
  ]);

  // Defaults are a convenience; a failed lookup must never block the form.
  const shop = shopResult.error ? null : shopResult.data;
  const certs = certResult.error ? [] : (certResult.data ?? []);
  // "Expired" is a calendar-date question in the shop's own timezone: a
  // certificate that expires today is still valid this evening in Alberta even
  // though UTC has already rolled over.
  const today = getShopScheduleDateContext(
    new Date(),
    shop?.timezone,
  ).dateKey;

  return NextResponse.json(
    {
      stationName: shopStationName(shop) || null,
      stationLocation: shopStationLocation(shop) || null,
      licenseNumber: pickInspectionLicenseNumber(certs, today),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
