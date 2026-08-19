import "server-only";

import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";

export default async function FieldInspectionBuilderLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireMobileServiceOperatorApiAccess();

  if (!access.ok) {
    redirect("/mobile/service");
  }

  if (!access.managementRole) {
    redirect("/mobile/inspections");
  }

  return children;
}
