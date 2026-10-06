import type { Metadata } from "next";

export type SearchLandingFaq = {
  question: string;
  answer: string;
};

export type SearchLandingSeo = {
  title: string;
  description: string;
  path: `/${string}`;
  keywords?: string[];
  faqs?: SearchLandingFaq[];
};

const siteUrl = "https://profixiq.com";

export function buildSearchLandingMetadata({
  title,
  description,
  path,
  keywords,
}: SearchLandingSeo): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      siteName: "ProFixIQ",
      title,
      description,
      url: path,
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
}

export function buildSearchLandingStructuredData({
  title,
  description,
  path,
  faqs = [],
}: SearchLandingSeo) {
  const pageUrl = `${siteUrl}${path}`;
  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: "ProFixIQ",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "ProFixIQ",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `${siteUrl}/`,
    },
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      description,
      isPartOf: {
        "@id": `${siteUrl}/#website`,
      },
      about: {
        "@id": `${siteUrl}/#software`,
      },
    },
  ];

  if (faqs.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: faqs.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function serializeSearchLandingStructuredData(
  data: ReturnType<typeof buildSearchLandingStructuredData>,
): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
