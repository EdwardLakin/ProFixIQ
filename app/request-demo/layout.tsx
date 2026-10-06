import type { Metadata } from "next";

const title = "Request Demo Access | ProFixIQ";
const description =
  "Request temporary access to a seeded ProFixIQ demo shop and explore work orders, inspections, parts workflows, approvals, field service, and fleet maintenance.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/request-demo",
  },
  openGraph: {
    title,
    description,
    url: "/request-demo",
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

export default function RequestDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
