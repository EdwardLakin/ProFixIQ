import { redirect } from "next/navigation";

// Legacy ownership shim. Canonical route: /parts/inventory (Add Part modal)
export default function LegacyNewPartPage() {
  redirect("/parts/inventory");
}
