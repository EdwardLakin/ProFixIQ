import type { Metadata } from "next";
import ManagerPageClient from "./ManagerPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Manager Dashboard" };

export default function Page() {
  return <ManagerPageClient />;
}
