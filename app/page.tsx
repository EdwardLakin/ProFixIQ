import type { Metadata } from "next";
import ProFixIQLanding from "@shared/components/ProFixIQLanding";

const description =
  "Heavy-duty repair shop software for diesel and commercial operations, with voice inspections, technician-built repairs, parts, approvals, field service, fleet maintenance, and optional Equipment workflows.";

export const metadata: Metadata = {
  title: "ProFixIQ | Heavy-Duty Repair Shop Software",
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ProFixIQ | Heavy-Duty Repair Shop Software",
    description,
    url: "/",
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ProFixIQ",
    url: "https://profixiq.com",
    logo: "https://profixiq.com/pwa-icons/icon-512",
    description,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ProFixIQ",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://profixiq.com",
    description,
    featureList: [
      "Heavy-duty repair work orders",
      "Voice inspections",
      "Technician-built repair recommendations",
      "Parts workflows",
      "Customer approvals",
      "Field service workflows",
      "Fleet maintenance management",
      "Optional off-road and industrial Equipment maintenance workflows",
      "Automotive repair workflows supported",
    ],
  },
];

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProFixIQLanding />
    </>
  );
}
