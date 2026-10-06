import type { Metadata } from "next";

const title = "ProFixIQ Pricing | Heavy-Duty & Automotive Repair Shop Software";
const description =
  "Compare ProFixIQ Shop Operations, Field Service, Fleet Maintenance, and Complete Operations plans, pricing, included capacity, and trial options.";

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
