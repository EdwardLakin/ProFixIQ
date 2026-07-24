import { redirect } from "next/navigation";

export default function AdminLandingPage() {
  redirect("/dashboard/workforce/overview");
}
