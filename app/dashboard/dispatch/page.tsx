import type { CSSProperties } from "react";
import { requireShopPageAccess } from "@/features/shared/lib/server/admin-access";
import DispatchBoardClient from "./DispatchBoardClient";

const dispatchTheme = {
  "--theme-action-primary": "var(--brand-primary,#2563eb)",
  "--theme-action-primary-text": "var(--theme-text-on-accent,#fff)",
} as CSSProperties;

export default async function DispatchPage() {
  await requireShopPageAccess({ requiredCapability: "canManageScheduling" });
  return (
    <div style={dispatchTheme}>
      <DispatchBoardClient />
    </div>
  );
}
