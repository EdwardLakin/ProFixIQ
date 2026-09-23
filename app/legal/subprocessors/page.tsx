import type { Metadata } from "next";
import LegalDocumentPage from "@/features/legal/components/LegalDocumentPage";
import { loadLegalDoc } from "@/features/legal/server/loadLegalDoc";

export const metadata: Metadata = {
  title: "Subprocessor List | ProFixIQ",
};

export default function SubprocessorListPage() {
  return <LegalDocumentPage content={loadLegalDoc("subprocessor-list")} />;
}
