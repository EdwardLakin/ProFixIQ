import { AttendanceOverviewClient } from "@/features/dashboard/app/dashboard/workforce/AttendanceOverviewClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getShopDayRange } from "@/features/shared/lib/utils/shopDayWindow";

export default async function WorkforceAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; person_id?: string }>;
}) {
  const { profile } = await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  const supabase = createServerSupabaseRSC();
  const { data: shop } = await supabase
    .from("shops")
    .select("timezone")
    .eq("id", profile.shop_id)
    .maybeSingle<{ timezone: string | null }>();

  const params = (await searchParams) ?? {};
  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : null;
  const selectedDay = requestedDate ? new Date(`${requestedDate}T12:00:00.000Z`) : new Date();
  const shopDay = getShopDayRange(shop?.timezone, selectedDay);

  return (
    <AttendanceOverviewClient
      from={shopDay.start}
      to={shopDay.end}
      timezone={shop?.timezone ?? null}
      role={profile.role}
      selectedDate={requestedDate ?? shopDay.start.slice(0, 10)}
      personId={params.person_id ?? null}
    />
  );
}
