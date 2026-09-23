import type { Metadata } from "next";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { loadLegalDoc } from "@/features/legal/server/loadLegalDoc";

export const metadata: Metadata = {
  title: "Terms of Service | ProFixIQ",
};

export default function TermsOfServicePage() {
  return <LegalDocumentPage content={loadLegalDoc("terms-of-service")} />;
}
