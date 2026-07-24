import WorkforceShell from "@/features/dashboard/app/dashboard/workforce/WorkforceShell";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAdminPageAccess({
    allow: ["owner", "admin", "manager"],
  });
  if (!profile.role) {
    throw new Error("Workforce access requires an assigned management role.");
  }

  return <WorkforceShell role={profile.role}>{children}</WorkforceShell>;
}
