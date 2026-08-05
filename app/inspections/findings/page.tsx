import { redirect } from "next/navigation";

export default function LegacyInspectionFindingsPage(): never {
  redirect("/inspections");
}
