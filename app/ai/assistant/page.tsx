import { redirect } from "next/navigation";

export default function LegacyAssistantRedirect() {
  redirect("/assistant");
}
