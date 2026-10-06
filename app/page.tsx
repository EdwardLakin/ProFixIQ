import type { Metadata } from "next";
import ProFixIQLanding from "@shared/components/ProFixIQLanding";

const description =
  "Heavy-duty and automotive repair shop software for voice inspections, technician-built repairs, parts workflows, approvals, field service, and fleet maintenance.";

export const metadata: Metadata = {
  title: "ProFixIQ | Heavy-Duty & Automotive Repair Shop Software",
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "ProFixIQ | Heavy-Duty & Automotive Repair Shop Software",
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
      "Heavy-duty and automotive work orders",
      "Voice inspections",
      "Technician-built repair recommendations",
      "Parts workflows",
      "Customer approvals",
      "Field service workflows",
      "Fleet maintenance management",
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
