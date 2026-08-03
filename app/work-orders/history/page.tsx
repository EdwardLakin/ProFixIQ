import type { CSSProperties } from "react";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";

import WorkOrdersHistoryClient from "./WorkOrdersHistoryClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_ACCESS_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "lead_hand",
  "foreman",
] as const;

const historyShellStyle: CSSProperties = {
  ["--dashboard-shell-bg" as string]:
    "var(--theme-gradient-panel)",
};

export default async function Page() {
  await requireShopPageAccess({ allowRoles: HISTORY_ACCESS_ROLES });

  return (
    <div style={historyShellStyle}>
      <WorkOrdersHistoryClient />
    </div>
  );
}
