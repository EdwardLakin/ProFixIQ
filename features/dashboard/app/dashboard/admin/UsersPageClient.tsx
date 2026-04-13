"use client";

import UsersList from "@/features/admin/components/UsersList";
import { AdminPageHeader, AdminPageShell } from "@/features/dashboard/app/dashboard/admin/AdminSurface";

export default function UsersPageClient() {
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Identity Governance"
        title="Users"
        subtitle="Search, update, and maintain user records with clear role and contact visibility."
      />
      <UsersList />
    </AdminPageShell>
  );
}
