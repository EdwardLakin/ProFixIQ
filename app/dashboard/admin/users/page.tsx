import { Suspense } from "react";
import UsersPageClient from "@/features/dashboard/app/dashboard/admin//UsersPageClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading users…</div>}>
      <UsersPageClient />
    </Suspense>
  );
}
