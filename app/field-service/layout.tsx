import type { Metadata } from "next";

const title = "Field Service Software | ProFixIQ";
const description =
  "Service-truck dispatch, off-site repair execution, inventory, evidence, and operator controls in one focused ProFixIQ field-service workspace.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/field-service",
  },
  openGraph: {
    title,
    description,
    url: "/field-service",
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

export default function FieldServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
