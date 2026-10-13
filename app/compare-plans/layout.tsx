import type { Metadata } from "next";

const title = "ProFixIQ Pricing | Heavy-Duty Repair Shop Software";
const description =
  "Compare ProFixIQ plans for heavy-duty and diesel repair operations, including Shop Operations, Field Service, Fleet Maintenance, Complete Operations, included capacity, pricing, and trial options.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/compare-plans",
  },
  openGraph: {
    title,
    description,
    url: "/compare-plans",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ComparePlansLayout({
  children,
}: {
    children: React.ReactNode;
}) {
  return children;
}
