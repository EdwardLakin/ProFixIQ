import type { ReactNode } from "react";
import OpsShell from "@/features/ops/components/OpsShell";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsLayout({ children }: { children: ReactNode }) {
  const access = await requireOpsOperatorPageAccess();
  return <OpsShell operatorEmail={access.operatorEmail}>{children}</OpsShell>;
}
