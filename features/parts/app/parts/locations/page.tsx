import { redirect } from "next/navigation";

// Legacy ownership shim. Canonical route: /parts/inventory
export default function LegacyPartsLocationsPage() {
  redirect("/parts/inventory");
}
