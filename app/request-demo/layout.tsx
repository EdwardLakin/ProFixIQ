import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request Demo Access | ProFixIQ",
  description:
    "Request temporary access to a seeded ProFixIQ demo shop and explore work orders, inspections, parts workflows, approvals, field service, and fleet maintenance.",
  alternates: {
    canonical: "/request-demo",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RequestDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
