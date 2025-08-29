import type { Metadata } from "next";
import PageClient from "./PageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Share your booking link",
};

export default function Page() {
  return <PageClient />;
}
