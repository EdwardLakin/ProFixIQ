import type { Metadata } from "next";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { loadLegalDoc } from "@/features/legal/server/loadLegalDoc";

export const metadata: Metadata = {
  title: "Data Processing Addendum | ProFixIQ",
};

export default function DataProcessingAddendumPage() {
  return <LegalDocumentPage content={loadLegalDoc("data-processing-addendum")} />;
}
