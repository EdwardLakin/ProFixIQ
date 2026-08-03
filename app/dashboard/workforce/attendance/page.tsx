import { AttendanceOverviewClient } from "@/features/dashboard/app/dashboard/workforce/AttendanceOverviewClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  getShopDayRange,
  shopLocalDateTimeToUtc,
} from "@/features/shared/lib/utils/shopDayWindow";
import { getShopScheduleDateContext } from "@/features/workforce/lib/schedulePosture";
import { isValidScheduleDateKey } from "@/features/workforce/lib/scheduleValidation";

export default async function WorkforceAttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; person_id?: string }>;
}) {
  const { profile } = await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });

  const admin = createAdminSupabase();
  const { data: shop } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", profile.shop_id)
    .maybeSingle<{ timezone: string | null }>();

  const params = (await searchParams) ?? {};
  const requestedDate = isValidScheduleDateKey(params.date)
    ? params.date
    : null;
  const defaultDate = getShopScheduleDateContext(
    new Date(),
    shop?.timezone,
  ).dateKey;
  const selectedDay = requestedDate
    ? new Date(
        shopLocalDateTimeToUtc(
          requestedDate,
          "12:00:00",
          shop?.timezone,
        ),
      )
    : new Date();
  const shopDay = getShopDayRange(shop?.timezone, selectedDay);

  return (
    <AttendanceOverviewClient
      from={shopDay.start}
      to={shopDay.end}
      timezone={shop?.timezone ?? null}
      role={profile.role}
      selectedDate={requestedDate ?? defaultDate}
      personId={params.person_id ?? null}
    />
  );
}
