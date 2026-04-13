// features/dashboard/app/dashboard/admin/UsersPageClient.tsx
"use client";

import UsersList from "@/features/admin/components/UsersList";

export default function UsersPageClient() {
  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-semibold">Users</h1>
      <UsersList />
    </div>
  );
}
