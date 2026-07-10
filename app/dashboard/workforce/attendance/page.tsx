import { AttendanceOverviewClient } from "@/features/dashboard/app/dashboard/workforce/AttendanceOverviewClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";

export default async function WorkforceAttendancePage() {
  const { profile } = await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  const supabase = createServerSupabaseRSC();
  const { data: shop } = await supabase
    .from("shops")
    .select("timezone")
    .eq("id", profile.shop_id)
    .maybeSingle<{ timezone: string | null }>();

  const shopDay = getShopDayRange(shop?.timezone, new Date());

  return (
    <AttendanceOverviewClient
      from={shopDay.start}
      to={shopDay.end}
      timezone={shop?.timezone ?? null}
      role={profile.role}
    />
  );
}
