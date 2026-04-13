import { redirect } from "next/navigation";

// Legacy ownership shim. Canonical route: /parts/inventory
export default function LegacyPartsSuppliersPage() {
  redirect("/parts/inventory");
}
