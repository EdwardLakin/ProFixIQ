import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "/field-service",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function FieldServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
