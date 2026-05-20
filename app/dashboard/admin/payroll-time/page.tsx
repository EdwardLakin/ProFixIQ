import WorkforceRelocationNotice from "@/features/dashboard/app/dashboard/workforce/WorkforceRelocationNotice";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import PayrollTimeClient from "@/features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });
  return <><WorkforceRelocationNotice href="/dashboard/workforce/payroll-review" /><PayrollTimeClient /></>;
}
