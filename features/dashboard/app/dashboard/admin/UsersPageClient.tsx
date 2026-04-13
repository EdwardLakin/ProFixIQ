"use client";

import UsersList from "@/features/admin/components/UsersList";
import { AdminPageHeader, AdminPageShell } from "@/features/dashboard/app/dashboard/admin/AdminSurface";

export default function UsersPageClient() {
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Identity Governance"
        title="Users"
        subtitle="Search, update, and maintain account identity/role access. Use Employees and Payroll Time for workforce posture and pay-period readiness."
      />
      <UsersList />
    </AdminPageShell>
  );
}
