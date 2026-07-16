import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { getLegalContent, LEGAL_CONTENT } from "@/features/legal/lib/content";

type PageProps = { params: Promise<{ document: string }> };

export function generateStaticParams() {
  return Object.keys(LEGAL_CONTENT).map((document) => ({ document }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { document } = await params;
  const content = getLegalContent(document);
  if (!content) return {};
  return {
    title: `${content.document.title} | ProFixIQ`,
    description: content.summary,
    robots: { index: false, follow: false },
  };
}

export default async function LegalDocumentRoute({ params }: PageProps) {
  const { document } = await params;
  const content = getLegalContent(document);
  if (!content) notFound();
  return <LegalDocumentPage content={content} />;
}
