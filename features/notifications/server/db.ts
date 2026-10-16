import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/** Notification tables are service-role only; all access goes through this client. */
export type NotificationAdmin = ReturnType<typeof createAdminSupabase>;

export function createNotificationAdmin(): NotificationAdmin {
  return createAdminSupabase();
}
