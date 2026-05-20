import PayrollTimeClient from "@/features/dashboard/app/dashboard/admin/payroll-time/PayrollTimeClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function WorkforcePayrollReviewPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager"] });
  return <PayrollTimeClient />;
}
