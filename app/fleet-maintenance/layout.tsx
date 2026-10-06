import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/fleet-maintenance",
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
