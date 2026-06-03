import { redirect } from "next/navigation";

export default function LegacyShopDefaultsRedirect() {
  redirect("/onboarding/v2");
}
