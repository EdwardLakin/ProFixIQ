import type { Metadata } from "next";

const title = "Fleet Maintenance Software | ProFixIQ";
const description =
  "Fleet-owned maintenance software for assets, PM programs, inspections, defects, approvals, and repair history in one ProFixIQ workspace.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/fleet-maintenance",
  },
  openGraph: {
    title,
    description,
    url: "/fleet-maintenance",
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

export default function FleetMaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
