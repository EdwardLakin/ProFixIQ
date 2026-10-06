import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/compare-plans",
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
