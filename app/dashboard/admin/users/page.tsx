import { redirect } from "next/navigation";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function Page() {
  await requireAdminPageAccess({ allow: ["owner", "admin"] });
  redirect("/dashboard/workforce/people");
}
