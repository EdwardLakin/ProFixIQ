import { redirect } from "next/navigation";

export default function LegacyScanToReceivePage(): never {
  redirect("/parts/receiving#scan-to-receive");
}
